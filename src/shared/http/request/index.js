/** @typedef {import('../types.js').RequestWrite} RequestWrite */
/** @typedef {import('../../types.js').AbsoluteHttpUrl} AbsoluteHttpUrl */
/** @typedef {import('../../types.js').HttpMethod} HttpMethod */
/** @typedef {import('../types.js').Headers} Headers */

import { HTTP_METHOD } from '../../http-method/index.js'
import { HTTP_STATUS_CODE } from '../../http-status-code/index.js'

import http from 'node:http'
import https from 'node:https'
import createBackoff from '../../backoff/index.js'
import retry from '../../function-call/retry/index.js'

/** @template T @template {Error} [E=Error] @typedef {import('../../types.js').Result<T, E>} Result */

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
    /** @type {import('node:http').RequestOptions} */ (requestParams),
  )

  await new Promise((resolve, reject) => {
    request.on('error', reject)
    request.on('socket', (/** @type {import('node:net').Socket} */ socket) => {
      if (socket.readyState === 'open') {
        resolve(undefined)
      } else {
        socket.on('connect', resolve)
      }
    })
  })

  const responsePromise = new Promise((resolve) => {
    request.on('response', (/** @type {http.IncomingMessage} */ response) => {
      resolve(response)
    })
  })

  return [request, responsePromise]
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

  let numOfTries = 0
  const retryResult = await retry(
    () => createRequest({ url, headers, method }),
    {
      retries,
      backoff,
      onRetry: () => (numOfTries += 1),
    },
  )
  if (!retryResult.ok) {
    return { ok: false, error: retryResult.error }
  }
  const [request, responsePromise] = retryResult.value

  //
  // Intercept all `request.write` calls for replay
  //

  /** @type {Parameters<RequestWrite>[]} */
  let requestWriteCalls = []
  request.write = new Proxy(request.write, {
    /**
     * @param {RequestWrite} target
     * @param {request} thisArg
     * @param {Parameters<RequestWrite>} args
     */
    apply(target, thisArg, args) {
      requestWriteCalls.push(args)
      return target.apply(thisArg, args)
    },
  })

  //
  // Intercept all `request.end` calls for replay
  //

  /** @type {Parameters<http.ClientRequest['end']> | []} */
  let requestEndCall = /** @type {[]} */ ([])
  request.end = new Proxy(request.end, {
    apply(target, thisArg, args) {
      requestEndCall = /** @type {Parameters<http.ClientRequest['end']>} */ (
        args
      )
      return target.apply(
        thisArg,
        /** @type {Parameters<http.ClientRequest['end']>} */ (args),
      )
    },
  })

  //
  // Creates a deferred (a Promise that can be resolved/rejected from the outside)
  //

  const {
    resolve: resolveResponse,
    reject: rejectResponse,
    promise: responseWithRetryPromise,
  } = Promise.withResolvers()

  //
  // Retry loop
  //

  async function loop() {
    if (numOfTries === 0) {
      numOfTries += 1

      const response = await responsePromise
      if (/** @type {number} */ (response.statusCode) < HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR) {
        resolveResponse(response)
        return
      }
    } else {
      numOfTries += 1

      const [request_, responsePromise_] = await createRequest({
        url,
        headers,
        method,
      })

      if (numOfTries >= retries) {
        request_.on('error', rejectResponse)
      } else {
        request_.on('error', () => {
          setTimeout(loop, 0).unref()
        })
      }

      for (const requestWriteCall of requestWriteCalls) {
        request_.write(...requestWriteCall)
      }

      request_.end(...requestEndCall)
      const response = await responsePromise_

      if (/** @type {number} */ (response.statusCode) < HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR) {
        resolveResponse(response)
        return
      }

      if (numOfTries >= retries) {
        resolveResponse(response)
        return
      }
    }
    await backoff()
    setTimeout(loop, 0).unref()
  }
  setTimeout(loop, 0)

  return { ok: true, value: [request, responseWithRetryPromise] }
}

export default createRequestWithRetry
