/** @typedef {import('../types.js').RequestWrite} RequestWrite */
/** @typedef {import('../../types.js').AbsoluteHttpUrl} AbsoluteHttpUrl */
/** @typedef {import('../../types.js').HttpMethod} HttpMethod */
/** @typedef {import('../types.js').Headers} Headers */
/** @import { Result } from '../../types.js' */
/** @typedef {import('node:net').Socket} NetSocket */
/** @typedef {import('node:http').RequestOptions} RequestOptions */

import { HTTP_METHOD } from '../../http-method/index.js'
import { HTTP_STATUS_CODE } from '../../http-status-code/index.js'

import http from 'node:http'
import https from 'node:https'
import createBackoff from '../../backoff/index.js'
import retry from '../../function-call/retry/index.js'

const MAX_RETRY_REPLAY_BUFFER_BYTES = 1024 * 1024 * 1024 // 1GB
const CONNECT_TIMEOUT_MS = 10_000
const RESPONSE_TIMEOUT_MS = 30_000

function createReplayBufferSizeError() {
  return new RangeError(
    `Request body exceeds replay limit of ${MAX_RETRY_REPLAY_BUFFER_BYTES} bytes.`,
  )
}

/**
 * @param {'connect' | 'response'} stage
 * @param {number} timeoutMs
 * @returns {Error}
 */
function createRequestTimeoutError(stage, timeoutMs) {
  return new Error(`Request ${stage} timeout after ${timeoutMs}ms.`)
}

/**
 * @param {string | Buffer | Uint8Array | (() => void) | undefined} chunk
 * @param {BufferEncoding | undefined} encoding
 * @returns {number}
 */
function getChunkByteLength(chunk, encoding) {
  if (chunk === undefined || typeof chunk === 'function') {
    return 0
  }
  if (typeof chunk === 'string') {
    return Buffer.byteLength(chunk, encoding)
  }
  return chunk.byteLength
}

/**
 * @param {string} protocol
 * @returns {Result<typeof http.request | typeof https.request, TypeError>}
 */
function getNativeRequest(protocol) {
  if (protocol === 'http:') {
    return { ok: true, value: http.request }
  }
  if (protocol === 'https:') {
    return { ok: true, value: https.request }
  }
  return {
    ok: false,
    error: new TypeError(
      `Only http: or https: protocols are supported. '${protocol}' was passed.`,
    ),
  }
}

/**
 * @param {URL} urlObj
 * @param {HttpMethod} method
 * @param {Headers} headers
 * @returns {{
 *   method: string
 *   hostname: string
 *   host: string
 *   port: number
 *   path: string
 *   headers: Headers
 *   protocol: string
 * }}
 */
function prepareRequestParams(urlObj, method, headers) {
  const requestParams = {
    method,
    hostname: urlObj.hostname,
    host: urlObj.hostname,
    port: Number(urlObj.port),
    path: `${urlObj.pathname}${urlObj.search}`,
    headers,
    protocol: urlObj.protocol,
  }

  if (!requestParams.port) {
    if (urlObj.protocol === 'https:') {
      requestParams.port = 443
    } else {
      requestParams.port = 80
    }
  }

  return requestParams
}

/**
 * @param {http.ClientRequest} request
 * @returns {Promise<void>}
 */
function waitForRequestSocketConnection(request) {
  return new Promise((resolve, reject) => {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timeoutId
    /** @type {NetSocket | undefined} */
    let pendingSocket

    function cleanup() {
      request.removeListener('error', onError)
      request.removeListener('socket', onSocket)
      if (pendingSocket) {
        pendingSocket.removeListener('connect', onSocketConnect)
        pendingSocket = undefined
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
    }

    /** @param {Error} error */
    function onError(error) {
      cleanup()
      reject(error)
    }

    function onSocketConnect() {
      cleanup()
      resolve(undefined)
    }

    /** @param {NetSocket} socket */
    function onSocket(socket) {
      if (socket.readyState === 'open') {
        cleanup()
        resolve(undefined)
      } else {
        pendingSocket = socket
        socket.once('connect', onSocketConnect)
      }
    }

    timeoutId = setTimeout(() => {
      request.destroy(createRequestTimeoutError('connect', CONNECT_TIMEOUT_MS))
    }, CONNECT_TIMEOUT_MS)
    timeoutId.unref()

    request.on('error', onError)
    request.on('socket', onSocket)
  })
}

/**
 * @param {http.ClientRequest} request
 * @returns {Promise<http.IncomingMessage>}
 */
function createResponsePromise(request) {
  return new Promise((resolve, reject) => {
    function onResponse(/** @type {http.IncomingMessage} */ response) {
      cleanup()
      resolve(response)
    }
    function onError(/** @type {Error} */ error) {
      cleanup()
      reject(error)
    }
    function onTimeout() {
      request.destroy(createRequestTimeoutError('response', RESPONSE_TIMEOUT_MS))
    }
    function cleanup() {
      request.setTimeout(0)
      request.removeListener('response', onResponse)
      request.removeListener('error', onError)
    }

    request.setTimeout(RESPONSE_TIMEOUT_MS, onTimeout)
    request.on('response', onResponse)
    request.on('error', onError)
  })
}

/**
 * @param {Object} options
 * @param {AbsoluteHttpUrl} options.url
 * @param {Headers} [options.headers]
 * @param {HttpMethod} [options.method]
 * @returns {Promise<[http.ClientRequest, Promise<http.IncomingMessage>]>}
 */
async function createRequest({ url, headers = {}, method = HTTP_METHOD.GET }) {
  const urlObj = new URL(url)
  const nativeRequestResult = getNativeRequest(urlObj.protocol)
  if (!nativeRequestResult.ok) {
    throw nativeRequestResult.error
  }
  const nativeRequest = nativeRequestResult.value
  const requestParams = prepareRequestParams(urlObj, method, headers)
  const request = nativeRequest(
    /** @type {RequestOptions} */ (requestParams),
  )
  await waitForRequestSocketConnection(request)
  const responsePromise = createResponsePromise(request)

  return [request, responsePromise]
}

/**
 * @param {number | undefined} statusCode
 * @returns {boolean}
 */
function isSuccessfulStatusCode(statusCode) {
  return (
    typeof statusCode === 'number' &&
    statusCode < HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR
  )
}

/**
 * Intercepts write/end calls on a request to record them for replay during
 * retries. Uses Proxy to transparently wrap the original methods, preserving
 * correct `this` binding and argument forwarding.
 *
 * @param {http.ClientRequest} request
 * @returns {{
 *   getWriteCalls: () => Parameters<RequestWrite>[]
 *   getEndCall: () => Parameters<http.ClientRequest['end']> | []
 * }}
 */
function attachReplayRecorder(request) {
  /** @type {Parameters<RequestWrite>[]} */
  const requestWriteCalls = []
  /** @type {Parameters<http.ClientRequest['end']> | []} */
  let requestEndCall = /** @type {[]} */ ([])
  let replayBufferBytes = 0

  /**
   * @param {number} nextChunkByteLength
   */
  function reserveReplayBufferBytes(nextChunkByteLength) {
    if (
      replayBufferBytes + nextChunkByteLength >
      MAX_RETRY_REPLAY_BUFFER_BYTES
    ) {
      throw createReplayBufferSizeError()
    }
    replayBufferBytes += nextChunkByteLength
  }

  request.write = new Proxy(request.write, {
    apply(target, thisArg, args) {
      const [chunk, encoding] = /** @type {Parameters<RequestWrite>} */ (args)
      reserveReplayBufferBytes(
        getChunkByteLength(
          chunk,
          /** @type {BufferEncoding | undefined} */ (encoding),
        ),
      )
      requestWriteCalls.push(/** @type {Parameters<RequestWrite>} */ (args))
      return target.apply(thisArg, /** @type {Parameters<RequestWrite>} */ (args))
    },
  })

  request.end = new Proxy(request.end, {
    apply(target, thisArg, args) {
      const requestEndArgs =
        /** @type {Parameters<http.ClientRequest['end']>} */ (args)
      const [chunk, encoding] = requestEndArgs
      reserveReplayBufferBytes(
        getChunkByteLength(
          chunk,
          /** @type {BufferEncoding | undefined} */ (encoding),
        ),
      )
      requestEndCall = requestEndArgs
      return target.apply(thisArg, requestEndArgs)
    },
  })

  return {
    getWriteCalls: () => requestWriteCalls,
    getEndCall: () => requestEndCall,
  }
}

/**
 * @param {http.IncomingMessage} response
 * @returns {Promise<void>}
 */
function drainResponse(response) {
  return new Promise((resolve) => {
    function cleanup() {
      response.removeListener('end', onDone)
      response.removeListener('close', onDone)
      response.removeListener('error', onDone)
    }

    function onDone() {
      cleanup()
      resolve()
    }

    response.once('end', onDone)
    response.once('close', onDone)
    response.once('error', onDone)
    response.resume()
  })
}

/**
 * @param {Object} options
 * @param {AbsoluteHttpUrl} options.url
 * @param {Headers} [options.headers]
 * @param {HttpMethod} [options.method]
 * @param {number} [options.retries]
 * @param {function(): Promise<void>} [options.backoff]
 * @returns {Promise<{ ok: true; value: [http.ClientRequest, Promise<http.IncomingMessage>] } | { ok: false; error: Error }>}
 */
async function createRequestWithRetry({
  url,
  headers = {},
  method = HTTP_METHOD.GET,
  retries = 0,
  backoff = createBackoff(),
}) {
  if (retries === 0) {
    try {
      const result = await createRequest({ url, headers, method })
      return { ok: true, value: result }
    } catch (error) {
      return { ok: false, error: /** @type {Error} */ (error) }
    }
  }

  const retryResult = await retry(
    () => createRequest({ url, headers, method }),
    {
      retries,
      backoff,
    },
  )
  if (!retryResult.ok) {
    return { ok: false, error: retryResult.error }
  }
  const [request, responsePromise] = retryResult.value
  const responseAttemptLimit = Math.max(1, retries)
  const replayRecorder = attachReplayRecorder(request)

  //
  // Creates a deferred (a Promise that can be resolved/rejected from the outside)
  //

  const {
    resolve: resolveResponse,
    reject: rejectResponse,
    promise: responseWithRetryPromise,
  } = /** @type {PromiseWithResolvers<http.IncomingMessage>} */ (
    Promise.withResolvers()
  )

  //
  // Retry loop
  //

  async function runResponseRetryLoop() {
    for (
      let responseAttempt = 0;
      responseAttempt < responseAttemptLimit;
      responseAttempt += 1
    ) {
      const isFirstAttempt = responseAttempt === 0
      const isLastAttempt = responseAttempt + 1 >= responseAttemptLimit

      try {
        /** @type {http.IncomingMessage} */
        let response

        if (isFirstAttempt) {
          response = await responsePromise
        } else {
          const [retryRequest, retryResponsePromise] = await createRequest({
            url,
            headers,
            method,
          })
          for (const requestWriteCall of replayRecorder.getWriteCalls()) {
            retryRequest.write(...requestWriteCall)
          }
          retryRequest.end(...replayRecorder.getEndCall())
          response = await retryResponsePromise
        }

        if (isSuccessfulStatusCode(response.statusCode) || isLastAttempt) {
          resolveResponse(response)
          return
        }

        await drainResponse(response)
      } catch (error) {
        if (isLastAttempt) {
          rejectResponse(error)
          return
        }
      }

      await backoff()
    }
  }
  setTimeout(() => {
    runResponseRetryLoop().catch(rejectResponse)
  }, 0).unref()

  return { ok: true, value: [request, responseWithRetryPromise] }
}

export default createRequestWithRetry
