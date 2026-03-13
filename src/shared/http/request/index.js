/** @typedef {import('../types.js').RequestWrite} RequestWrite */

import http from 'node:http'
import https from 'node:https'
import createBackoff from '../../backoff/index.js'
import retry from '../../function-call/retry/index.js'

/**
 * @param {string} protocol
 * @returns {http.request | https.request}
 */
function getNativeRequest(protocol) {
  if (protocol === 'http:') {
    return http.request
  }
  if (protocol === 'https:') {
    return https.request
  }
  throw new TypeError(
    `Only http: or https: protocols are supported. '${protocol}' was passed.`,
  )
}

/**
 * @param {URL} urlObj
 * @param {string} method
 * @param {Object<string, any>} headers
 * @returns {{
 *   method: string
 *   hostname: string
 *   port: number
 *   path: string
 *   headers: Object<string, any>
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
 * @param {string} options.url
 * @param {Object} [options.headers]
 * @param {string} [options.method]
 * @returns {Promise<[http.ClientRequest, Promise<http.IncomingMessage>]>}
 */
async function createRequest({ url, headers = {}, method = 'GET' }) {
  const urlObj = new URL(url)
  const nativeRequest = getNativeRequest(urlObj.protocol)
  const requestParams = prepareRequestParams(urlObj, method, headers)
  const request = nativeRequest(requestParams)

  await new Promise((resolve, reject) => {
    request.on('error', reject)
    request.on('socket', (socket) => {
      if (socket.readyState === 'open') {
        resolve(undefined)
      } else {
        socket.on('connect', resolve)
      }
    })
  })

  const responsePromise = new Promise((resolve) => {
    request.on('response', (response) => {
      resolve(response)
    })
  })

  return [request, responsePromise]
}

/**
 * @param {Object} options
 * @param {string} options.url
 * @param {Object} [options.headers]
 * @param {string} [options.method]
 * @param {number} [options.retries]
 * @param {function(): Promise<void>} [options.backoff]
 * @returns {Promise<[http.ClientRequest, Promise<http.IncomingMessage>]>}
 */
async function createRequestWithRetry({
  url,
  headers = {},
  method = 'GET',
  retries = 0,
  backoff = createBackoff(),
}) {
  if (retries === 0) {
    return createRequest({ url, headers, method })
  }

  let numOfTries = 0
  const [request, responsePromise] = await retry(
    () => createRequest({ url, headers, method }),
    {
      retries,
      backoff,
      onRetry: () => (numOfTries += 1),
    },
  )

  //
  // Intercept all `request.write` calls for replay
  //

  /** @type {Parameters<RequestWrite>[] | null} */
  let requestWriteCalls = null
  request.write = new Proxy(request.write, {
    /**
     * @param {RequestWrite} target
     * @param {request} thisArg
     * @param {Parameters<RequestWrite>} args
     */
    apply(target, thisArg, args) {
      if (!requestWriteCalls) {
        requestWriteCalls = [args]
      } else {
        requestWriteCalls.push(args)
      }
      return target.apply(thisArg, args)
    },
  })

  //
  // Intercept all `request.end` calls for replay
  //

  /** @type {any[]} */
  let requestEndCall = []
  request.end = new Proxy(request.end, {
    apply(target, thisArg, args) {
      requestEndCall = args
      return target.apply(thisArg, args)
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
      if (response.statusCode === 200) {
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

      // Add `'error'` listener only on last attempt
      if (numOfTries === retries) {
        request_.on('error', rejectResponse)
      }

      if (requestWriteCalls) {
        for (const requestWriteCall of requestWriteCalls) {
          request_.write(...requestWriteCall)
        }
      }

      request_.end(...requestEndCall)
      const response = await responsePromise_

      if (response.statusCode === 200) {
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

  return [request, responseWithRetryPromise]
}

export default createRequestWithRetry
