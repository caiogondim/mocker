/** @typedef {import('./args/index.js').Args} Args */
/** @typedef {import('./shared/types.js').AsyncHttpServer} AsyncHttpServer */
/** @typedef {import('./shared/types.js').FsLike} FsLike */
/** @typedef {import('./shared/types.js').ConnectionId} ConnectionId */
/** @typedef {import('./shared/stream/rewindable/types.js').Rewindable} Rewindable */
/** @typedef {import('./shared/http/index.js').Headers} Headers */
/** @typedef {import('./shared/types.js').HttpMethod} HttpMethod */
/** @typedef {InstanceType<import('./mock-manager/mocked-request.js')["default"]>} MockedRequest */
/** @template T @template {Error} [E=Error] @typedef {import('./shared/types.js').Result<T, E>} Result */
/** @typedef {import('./mock-manager/mock-file-error.js').MockFileError} MockFileError */

import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import createLogger from './shared/logger/index.js'
import { bold, dim, green, yellow, red } from './shared/logger/format/index.js'
import { createMockManager } from './mock-manager/index.js'
import { createOrigin } from './origin/index.js'
import { delay, throttle, pipeline, rewindable } from './shared/stream/index.js'
import createId from './shared/create-id/index.js'
import {
  getHeaders,
  redactHeaders,
  isHeaders,
  SecretNotFoundError,
} from './shared/http/index.js'
import { MODE } from './args/index.js'
import { HTTP_METHOD } from './shared/http-method/index.js'
import { HTTP_STATUS_CODE } from './shared/http-status-code/index.js'

const packageJson = createRequire(import.meta.url)('../package.json')
const logger = createLogger()
const closingMockerText = '\r  \nclosing mocker 👋'
const SHUTDOWN_TIMEOUT_MS = 3000

class OriginResponseError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'OriginResponseError'
  }
}

const terminationSignals = ['SIGHUP', 'SIGINT', 'SIGTERM']

/**
 * @param {unknown} error
 * @param {string} mockBasename
 * @param {string} progressStr
 */
function logUpdateError(error, mockBasename, progressStr) {
  if (error instanceof SecretNotFoundError) {
    logger.warn(
      `${dim(progressStr)} ${bold(mockBasename)} ${error.message}. mock was not modified`,
    )
  } else if (error && Reflect.get(error, 'code') === 'EACCES') {
    logger.warn(
      `${dim(progressStr)} ${bold(mockBasename)} file is read-only. mock was not modified`,
    )
  } else {
    logger.warn(
      `${dim(progressStr)} ${bold(mockBasename)} error while updating mock. mock was not modified`,
    )
  }
}

/**
 * @param {http.IncomingMessage} responseSource
 * @param {http.ServerResponse} responseTarget
 * @returns {void}
 */
function copyResponseAttrs(responseSource, responseTarget) {
  /** @type {Headers} */
  const headers = {}

  for (const [headerKey, headerValue] of Object.entries(
    getHeaders(responseSource),
  )) {
    if (typeof headerValue === 'undefined') {
      continue
    }
    headers[headerKey] = headerValue
  }

  delete headers['content-length']

  responseTarget.statusCode = responseSource.statusCode || HTTP_STATUS_CODE.OK
  if (responseSource.statusMessage) {
    responseTarget.statusMessage = responseSource.statusMessage
  }
  for (const [key, value] of Object.entries(headers)) {
    if (value !== null) {
      responseTarget.setHeader(key, value)
    }
  }
}

/**
 * @param {http.ServerResponse} response
 * @param {ConnectionId} connectionId
 * @returns {Promise<void>}
 */
async function respondNotFound(response, connectionId) {
  logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(404)}`)

  response.setHeader('x-mocker-request-id', connectionId)
  response.setHeader('x-mocker-response-from', 'Mock')
  response.setHeader('x-mocker-mock-path', 'Not Found')
  response.writeHead(HTTP_STATUS_CODE.NOT_FOUND)
  response.end()
}

/**
 * @param {number | undefined} statusCode
 * @returns {string}
 */
function formatStatusCode(statusCode) {
  if (!statusCode) {
    return ''
  } else if (statusCode < 300) {
    return bold(green(statusCode))
  } else if (statusCode < 400) {
    return bold(yellow(statusCode))
  } else {
    return bold(red(statusCode))
  }
}

/**
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {ConnectionId} connectionId
 * @returns {void}
 */
function handleLiveAndReadinessConnection(request, response, connectionId) {
  const statusCode = HTTP_STATUS_CODE.OK

  logger.info(
    `${dim(connectionId)} 👈 ${formatStatusCode(
      statusCode,
    )} serving health check from mocker`,
  )

  response.writeHead(statusCode)
  response.end()
}

class Mocker {
  /** @type {Args & { fs: FsLike }} */
  #args

  #origin

  #mockManager

  /** @type {http.Server | null} */
  #httpServer = null

  /** @type {Set<import('node:net').Socket>} */
  #connections = new Set()

  /** @type {Promise<void> | null} */
  #closingPromise = null

  /** @type {(() => Promise<void>)[] } */
  #signalHandlers = []

  /** @param {Args & { fs: FsLike }} args */
  constructor(args) {
    this.#args = args

    this.#origin = createOrigin({
      host: args.origin,
      retries: args.retries,
      overwriteRequestHeaders: args.overwriteRequestHeaders,
      ...(args.proxy !== '' ? { proxyUrl: args.proxy } : {}),
    })

    this.#mockManager = createMockManager({
      mocksDir: args.mocksDir,
      mockKeys: args.mockKeys,
      redactedHeaders: args.redactedHeaders,
      fs: args.fs,
    })
  }

  /** @returns {boolean} */
  get listening() {
    if (!this.#httpServer) return false
    return this.#httpServer.listening
  }

  /** @returns {number} */
  get port() {
    const addr = this.#httpServer?.address()
    if (addr && typeof addr === 'object') return addr.port
    return 0
  }

  /**
   * @param {number} port
   * @returns {Promise<void>}
   */
  async listen(port = this.#args.port) {
    const args = this.#args

    function printStartMessage() {
      return `\nstarting mocker 🥸 v${
        packageJson.version
      } with arguments: \n${Object.entries(args)
        .map((entry) => {
          if (entry[0] === 'mockKeys' && entry[1] instanceof Set) {
            return `- ${bold(entry[0])}: ${Array.from(entry[1])}`
          }

          if (
            entry[0] === 'overwriteResponseHeaders' ||
            entry[0] === 'overwriteRequestHeaders'
          ) {
            return `- ${bold(entry[0])}: ${JSON.stringify(entry[1], null, 2)}`
          }

          if (entry[0] === 'redactedHeaders' && isHeaders(entry[1])) {
            return `- ${bold(entry[0])}: ${JSON.stringify(
              redactHeaders(entry[1], args.redactedHeaders),
              null,
              2,
            )}`
          }

          return `- ${bold(entry[0])}: ${entry[1]}`
        })
        .join('\n')}\n`
    }

    logger.log(printStartMessage())
    this.#addListeners()

    if (args.update === 'startup' || args.update === 'only') {
      await this.#updateMocks()
    }

    if (args.update === 'only') {
      this.#removeListeners()
      logger.log(closingMockerText)
      return
    }

    return new Promise((resolve) => {
      logger.info(
        `started on port ${bold(port)}, with pid ${bold(
          process.pid,
        )}, and proxying ${bold(args.origin)}`,
      )
      const httpServer = http.createServer(this.#server.bind(this))
      httpServer.on('connection', (socket) => {
        this.#connections.add(socket)
        socket.on('close', () => {
          this.#connections.delete(socket)
        })
      })
      this.#httpServer = httpServer.listen(port, resolve)
    })
  }

  /** @returns {Promise<void>} */
  async close() {
    if (this.#closingPromise) {
      return this.#closingPromise
    }

    const httpServer = this.#httpServer

    this.#removeListeners()

    this.#closingPromise = new Promise((resolve, reject) => {
      if (httpServer && httpServer.listening) {
        const forceCloseTimeout = setTimeout(() => {
          if (typeof httpServer.closeIdleConnections === 'function') {
            httpServer.closeIdleConnections()
          }
          for (const connection of this.#connections) {
            connection.destroy()
          }
        }, SHUTDOWN_TIMEOUT_MS)

        httpServer.close((error) => {
          clearTimeout(forceCloseTimeout)
          this.#closingPromise = null
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      } else {
        this.#closingPromise = null
        resolve()
      }
    })

    return this.#closingPromise
  }

  async [Symbol.asyncDispose]() {
    await this.close()
  }

  /**
   * @returns {void}
   */
  #addListeners() {
    for (const signal of terminationSignals) {
      const handler = async () => {
        logger.log(closingMockerText)
        await this.close()
      }
      this.#signalHandlers.push(handler)
      process.on(signal, handler)
    }
  }

  /**
   * @returns {void}
   */
  #removeListeners() {
    for (let i = 0; i < this.#signalHandlers.length; i++) {
      process.removeListener(terminationSignals[i], this.#signalHandlers[i])
    }
    this.#signalHandlers = []
  }

  /**
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @returns {Promise<void>}
   */
  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {ConnectionId} connectionId
   * @returns {Promise<Result<undefined>>}
   */
  async #dispatchByMode(request, response, connectionId) {
    try {
      const args = this.#args
      switch (args.mode) {
        case MODE.READ: {
          await this.#handleConnectionWithReadMode(
            request,
            response,
            connectionId,
          )
          return { ok: true, value: undefined }
        }
        case MODE.READ_WRITE: {
          await this.#handleConnectionWithReadWriteMode(
            request,
            response,
            connectionId,
          )
          return { ok: true, value: undefined }
        }
        case MODE.READ_PASS: {
          await this.#handleConnectionWithReadPassMode(
            request,
            response,
            connectionId,
          )
          return { ok: true, value: undefined }
        }
        case MODE.WRITE:
        case MODE.PASS: {
          await this.#respondFromOrigin(request, response, connectionId)
          return { ok: true, value: undefined }
        }
        case MODE.PASS_READ: {
          await this.#handleConnectionWithPassReadMode(
            request,
            response,
            connectionId,
          )
          return { ok: true, value: undefined }
        }
        default: {
          const _exhaustiveCheck = /** @type {never} */ (args.mode)
          return { ok: false, error: new TypeError(`invalid args.mode: ${_exhaustiveCheck}`) }
        }
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
    }
  }

  /**
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @returns {Promise<void>}
   */
  async #server(request, response) {
    const args = this.#args
    const connectionId = createId()

    response.setHeader('x-powered-by', 'mocker')

    logger.info(
      `${dim(connectionId)} 👉 ${bold(request.method)} ${bold(request.url)}`,
    )

    // Implementing live and readiness health checks under "/.well-known/"
    // prefix (IETF RFC-5785 https://datatracker.ietf.org/doc/html/rfc5785)
    if (
      request.url === '/.well-known/live' ||
      request.url === '/.well-known/ready'
    ) {
      // 'ready' and 'live' means the same thing for mocker, so we can use the
      //  same connection handler.
      handleLiveAndReadinessConnection(request, response, connectionId)
      return
    }

    const requestRewindableResult = rewindable(request)
    if (!requestRewindableResult.ok) {
      logger.error(`${dim(connectionId)} ${requestRewindableResult.error}`)

      if (!response.headersSent) {
        response.writeHead(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)
      }
      response.end()

      logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(500)}`)
      return
    }
    const requestRewindable = requestRewindableResult.value

    if (args.cors && request.method === HTTP_METHOD.OPTIONS) {
      this.#handleCors(requestRewindable, response, connectionId)
      return
    }

    const result = await this.#dispatchByMode(requestRewindable, response, connectionId)
    if (!result.ok) {
      logger.error(`${dim(connectionId)} ${result.error}`)

      if (!response.headersSent) {
        response.writeHead(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)
      }
      response.end()

      logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(500)}`)
    }
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {ConnectionId} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithReadWriteMode(request, response, connectionId) {
    const getResult = await this.#mockManager.get({ request, connectionId })
    if (getResult.ok) {
      await this.#serveFromMockResult(getResult.value, request, response, connectionId)
      return
    }
    const mockBasename = path.basename(getResult.error.mockPath)
    logger.warn(`${dim(connectionId)} mocked response "${mockBasename}" was not found`)
    await this.#respondFromOrigin(request, response, connectionId)
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {ConnectionId} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithReadPassMode(request, response, connectionId) {
    const getResult = await this.#mockManager.get({ request, connectionId })
    if (getResult.ok) {
      await this.#serveFromMockResult(getResult.value, request, response, connectionId)
      return
    }
    const mockBasename = path.basename(getResult.error.mockPath)
    logger.info(`${dim(connectionId)} mocked response "${mockBasename}" was not found`)
    await this.#respondFromOrigin(request, response, connectionId)
  }

  /**
   *@param {http.IncomingMessage} request
   *@param {http.ServerResponse} response
   *@param {ConnectionId} connectionId
   *@returns {Promise<void>}
   */
  async #handleCors(request, response, connectionId) {
    logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(200)} CORS`)

    if (request.headers.origin) {
      response.setHeader('access-control-allow-origin', request.headers.origin)
    }
    response.setHeader('access-control-allow-credentials', 'true')
    response.setHeader(
      'access-control-allow-methods',
      'PUT, GET, POST, DELETE, OPTIONS',
    )
    response.setHeader(
      'access-control-allow-headers',
      request.headers['access-control-request-headers'] || '*',
    )
    response.end()
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {ConnectionId} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithReadMode(request, response, connectionId) {
    const getResult = await this.#mockManager.get({ request, connectionId })
    if (getResult.ok) {
      await this.#serveFromMockResult(getResult.value, request, response, connectionId)
      return
    }
    const mockBasename = path.basename(getResult.error.mockPath)
    logger.warn(`${dim(connectionId)} mocked response "${mockBasename}" was not found`)
    await respondNotFound(response, connectionId)
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {ConnectionId} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithPassReadMode(request, response, connectionId) {
    try {
      await this.#respondFromOrigin(request, response, connectionId)
      return
    } catch (error) {
      if (
        !(
          error instanceof OriginResponseError ||
          Reflect.get(error || {}, 'code') === 'ECONNREFUSED'
        )
      ) {
        throw error
      }

      logger.warn(`${dim(connectionId)} error fetching from origin`)

      const getResult = await this.#mockManager.get({ request, connectionId })
      if (getResult.ok) {
        await this.#serveFromMockResult(getResult.value, request, response, connectionId)
        return
      }
      const mockBasename = path.basename(getResult.error.mockPath)
      logger.warn(`${dim(connectionId)} mocked response "${mockBasename}" was not found`)
      await respondNotFound(response, connectionId)
      return
    }
  }

  /**
   * @param {{ mockedResponse: InstanceType<import('./mock-manager/mocked-response.js')["default"]>; mockPath: string }} mockResult
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {ConnectionId} connectionId
   * @returns {Promise<void>}
   */
  async #serveFromMockResult({ mockedResponse, mockPath }, request, response, connectionId) {
    const args = this.#args
    const mockBasename = path.basename(mockPath)

    logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(mockedResponse.statusCode)} serving from mocked response "${mockBasename}"`)

    response.statusCode = mockedResponse.statusCode
    response.setHeader('x-mocker-mock-path', mockPath)
    response.setHeader('x-mocker-response-from', 'Mock')
    response.setHeader('x-mocker-request-id', connectionId)
    for (const [key, value] of Object.entries(mockedResponse.headers)) {
      if (value === null || value === undefined) continue
      response.setHeader(key, value)
    }

    this.#overwriteResponseHeaders(response, /** @type {Headers} */ (request.headers))

    try {
      await pipeline(mockedResponse, delay({ ms: args.delay }), throttle({ bps: args.throttle }), response)
    } catch (error) {
      logger.error(`${dim(connectionId)} error piping mocked response.`, error)
      if (!response.headersSent) {
        response.writeHead(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)
      }
      response.end()
      logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(500)}`)
    }
  }

  /**
   * @param {http.IncomingMessage & Rewindable} clientToProxyRequest
   * @param {http.ServerResponse} proxyToClientResponse
   * @param {ConnectionId} connectionId
   * @returns {Promise<void>}
   */
  async #respondFromOrigin(
    clientToProxyRequest,
    proxyToClientResponse,
    connectionId,
  ) {
    const args = this.#args
    const origin = this.#origin
    const { method, url = '' } = clientToProxyRequest
    const requestHeaders = clientToProxyRequest.headers

    proxyToClientResponse.setHeader('x-mocker-request-id', connectionId)
    proxyToClientResponse.setHeader('x-mocker-response-from', 'Origin')

    const requestResult = await origin.request({
      url,
      headers: /** @type {Headers} */ (requestHeaders),
      method: /** @type {HttpMethod | undefined} */ (method),
    })

    if (!requestResult.ok) {
      throw requestResult.error
    }

    const [proxyToOriginRequest, originToProxyResponsePromise] =
      requestResult.value

    const [originToProxyResponse] = await Promise.all([
      originToProxyResponsePromise,
      pipeline(clientToProxyRequest.rewind(), proxyToOriginRequest),
    ])
    const originToProxyResponseRewindableResult = rewindable(originToProxyResponse)
    if (!originToProxyResponseRewindableResult.ok) {
      throw originToProxyResponseRewindableResult.error
    }
    const originToProxyResponseRewindable = originToProxyResponseRewindableResult.value

    const originToProxyResponseStatusCode =
      originToProxyResponse?.statusCode ??
      HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR
    if (
      args.mode === MODE.PASS_READ &&
      originToProxyResponseStatusCode >= 500
    ) {
      throw new OriginResponseError(`${originToProxyResponseStatusCode}`)
    }

    copyResponseAttrs(originToProxyResponse, proxyToClientResponse)
    this.#overwriteResponseHeaders(
      proxyToClientResponse,
      /** @type {Headers} */ (requestHeaders),
    )

    await this.#writeMockIfOk(
      clientToProxyRequest,
      originToProxyResponseRewindable,
      connectionId,
    )

    logger.info(
      `${dim(connectionId)} 👈 ${formatStatusCode(
        originToProxyResponse.statusCode,
      )} serving from origin`,
    )

    await pipeline(
      originToProxyResponseRewindable.rewind(),
      delay({ ms: args.delay }),
      throttle({ bps: args.throttle }),
      proxyToClientResponse,
    )
  }

  /**
   * @param {http.ServerResponse} response
   * @param {Headers} requestHeaders
   * @returns {void}
   */
  #overwriteResponseHeaders(response, requestHeaders) {
    const args = this.#args

    for (const [key, value] of Object.entries(args.overwriteResponseHeaders)) {
      if (value === null || value === undefined) {
        response.removeHeader(key)
      } else {
        response.setHeader(key, value)
      }
    }

    if (args.cors && requestHeaders.origin) {
      response.setHeader('access-control-allow-origin', requestHeaders.origin)
    }
  }

  /**
   * @param {(http.IncomingMessage | MockedRequest) & Rewindable} request
   * @param {http.IncomingMessage & Rewindable} response
   * @param {ConnectionId} connectionId
   * @returns {Promise<void>}
   */
  async #writeMockIfOk(request, response, connectionId) {
    const args = this.#args
    const mockManager = this.#mockManager

    if (!(args.mode === MODE.WRITE || args.mode === MODE.READ_WRITE)) return

    if (
      response.statusCode &&
      response.statusCode >= 200 &&
      response.statusCode < 300
    ) {
      const setResult = await mockManager.set({
        request,
        response,
        connectionId,
      })
      if (setResult.ok) {
        const mockBasename = path.basename(setResult.value.mockPath)
        logger.info(
          `${dim(connectionId)} mock for request created on "${mockBasename}"`,
        )
      } else {
        logger.error(`${dim(connectionId)} error while saving mock`, setResult.error)
      }
    } else {
      logger.warn(
        `${dim(
          connectionId,
        )} not saving response from origin since status code is not ${formatStatusCode(
          HTTP_STATUS_CODE.OK,
        )} but ${formatStatusCode(response.statusCode)}`,
      )
    }
  }

  /**
   * @param {Result<{ mockPath: string; mockedRequest: MockedRequest & Rewindable }, MockFileError>} item
   * @param {string} progressStr
   * @returns {Promise<void>}
   */
  async #updateMock(item, progressStr) {
    if (!item.ok) throw item.error

    const mockBasename = path.basename(item.value.mockPath)
    const { mockedRequest } = item.value

    const requestResult = await this.#origin.request({
      url: mockedRequest.url,
      headers: mockedRequest.headers,
      method: mockedRequest.method,
    })

    if (!requestResult.ok) {
      throw requestResult.error
    }

    const [proxyToOriginRequest, originToProxyResponsePromise] =
      requestResult.value

    const [originToProxyResponseResult] = await Promise.all([
      (async () => {
        const result = rewindable(await originToProxyResponsePromise)
        if (!result.ok) throw result.error
        return result.value
      })(),
      pipeline(mockedRequest.rewind(), proxyToOriginRequest),
    ])
    const originToProxyResponse = originToProxyResponseResult

    if (
      originToProxyResponse.statusCode &&
      originToProxyResponse.statusCode >= 200 &&
      originToProxyResponse.statusCode < 300
    ) {
      const setResult = await this.#mockManager.set({
        request: mockedRequest,
        response: originToProxyResponse,
      })
      if (setResult.ok) {
        logger.success(`${dim(progressStr)} ${bold(mockBasename)}`)
      } else {
        logger.warn(
          `${dim(progressStr)} ${bold(mockBasename)} error while saving mock. mock was not modified`,
        )
      }
    } else {
      logger.warn(
        `${dim(progressStr)} ${bold(mockBasename)} request to origin errored. mock was not modified`,
      )
    }
  }

  async #updateMocks() {
    const mockManager = this.#mockManager
    const total = await mockManager.size()
    let i = 1

    if (total === 0) {
      logger.warn('no mocks in the responses folder, skipping mocks update')
      return
    }

    logger.info(`updating ${bold(total)} mocks...`)

    function progress() {
      return `[${`${i}`.padStart(`${total}`.length, '0')}/${total}]`
    }

    for await (const item of mockManager.getAll()) {
      const mockPath = item.ok ? item.value.mockPath : item.error.mockPath
      const mockBasename = path.basename(mockPath)

      try {
        await this.#updateMock(item, progress())
      } catch (error_) {
        logUpdateError(error_, mockBasename, progress())
      }

      i += 1
    }
  }
}

export default Mocker
