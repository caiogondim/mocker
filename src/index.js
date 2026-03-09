/** @typedef {import('./args/index.js').Args} Args */
/** @typedef {import('./shared/types.js').AsyncHttpServer} AsyncHttpServer */
/** @typedef {import('./shared/types.js').FsLike} FsLike */
/** @typedef {import('./shared/stream/rewindable/types.js').Rewindable} Rewindable */
/** @typedef {import('./shared/http/index.js').Headers} Headers */
/** @typedef {InstanceType<import('./mock-manager/mocked-request.js')["default"]>} MockedRequest */

import path from 'node:path'
import http from 'node:http'
import cluster from 'node:cluster'
import os from 'node:os'
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

const packageJson = createRequire(import.meta.url)('../package.json')
const logger = createLogger()
const closingMockerText = '\r  \nclosing mocker 👋'

class OriginResponseError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'OriginResponseError'
  }
}

const terminationSignals = ['SIGHUP', 'SIGINT', 'SIGTERM']

const nonFatalErrors = ['ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID']

/**
 * @param {http.IncomingMessage} responseSource
 * @param {http.ServerResponse} responseTarget
 * @returns {void}
 */
function copyResponseAttrs(responseSource, responseTarget) {
  /** @type {Object<string, any>} */
  const headers = {}

  for (const [headerKey, headerValue] of Object.entries(
    getHeaders(responseSource)
  )) {
    if (typeof headerValue === 'undefined') {
      continue
    }
    headers[headerKey] = headerValue
  }

  delete headers['content-length']

  responseTarget.statusCode = responseSource.statusCode || 200
  if (responseSource.statusMessage) {
    responseTarget.statusMessage = responseSource.statusMessage
  }
  for (const [key, value] of Object.entries(headers)) {
    responseTarget.setHeader(key, value)
  }
}

/**
 * @param {http.ServerResponse} response
 * @param {string} connectionId
 * @returns {Promise<void>}
 */
async function respondNotFound(response, connectionId) {
  logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(404)}`)

  response.setHeader('x-mocker-request-id', connectionId)
  response.setHeader('x-mocker-response-from', 'Mock')
  response.setHeader('x-mocker-mock-path', 'Not Found')
  response.writeHead(404)
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
 * @param {string} connectionId
 * @returns {void}
 */
function handleLiveAndReadinessConnection(request, response, connectionId) {
  const statusCode = 200

  logger.info(
    `${dim(connectionId)} 👈 ${formatStatusCode(
      statusCode
    )} serving health check from mocker`
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

  #state = {
    isClosing: false,
  }

  /** @param {Args & { fs: FsLike }} args */
  constructor(args) {
    this.#args = args

    this.#origin = createOrigin({
      host: args.origin,
      retries: args.retries,
      overwriteRequestHeaders: args.overwriteRequestHeaders,
    })

    this.#mockManager = createMockManager({
      responsesDir: args.responsesDir,
      mockKeys: args.mockKeys,
      redactedHeaders: args.redactedHeaders,
      fs: args.fs,
    })

    /** @type {AsyncHttpServer} */
    // Checks if instance implements AsyncHttpServer interface.
    // eslint-disable-next-line no-unused-vars
    const instance = this
  }

  /**
   * Returns `true` if the server is running and listening on a TCP port.
   * `false` otherwise.
   *
   * @returns {boolean}
   */
  get listening() {
    if (!this.#httpServer) return false
    return this.#httpServer.listening
  }

  /**
   * Binds server to a TCP port.
   *
   * @param {number} port
   * @returns {Promise<void>}
   */
  async listen(port = this.#args.port) {
    const args = this.#args
    const state = this.#state

    state.isClosing = false

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
              2
            )}`
          }

          return `- ${bold(entry[0])}: ${entry[1]}`
        })
        .join('\n')}\n`
    }

    if (cluster.isPrimary) {
      logger.log(printStartMessage())

      this.#addListeners()

      if (args.update === 'startup' || args.update === 'only') {
        await this.#updateMocks()
      }

      if (args.update === 'only') {
        logger.log(closingMockerText)
        return
      }
    }

    return new Promise((resolve) => {
      // Cluster mode doesn't play well with Jest.
      if (process.env.NODE_ENV === 'test') {
        logger.info(
          `started on port ${bold(port)}, with pid ${bold(
            process.pid
          )}, and proxying ${bold(args.origin)}`
        )
        this.#httpServer = http
          .createServer(this.#server.bind(this))
          .listen(port, resolve)
      } else if (cluster.isPrimary) {
        logger.info(
          `started on port ${bold(port)}, with pid ${bold(
            process.pid
          )}, and proxying ${bold(args.origin)}`
        )

        const numCpus = os.cpus().length
        logger.info(
          `system has ${bold(numCpus)} CPU${
            numCpus > 1 ? 's' : ''
          }, spawning ${bold(args.workers)} worker${
            args.workers > 1 ? 's' : ''
          }`
        )

        for (let i = 0; i < args.workers; i += 1) {
          cluster.fork()
        }

        cluster.on('online', (worker) => {
          logger.info(`worker pid ${bold(worker.process.pid)} started`)
        })

        cluster.on('exit', (worker) => {
          if (!state.isClosing) {
            logger.warn(`worker pid ${bold(worker.process.pid)} died`)

            cluster.fork()
          }
        })

        cluster.on('listening', resolve)
      } else if (cluster.isWorker) {
        this.#httpServer = http
          .createServer(this.#server.bind(this))
          .listen(port, resolve)
      }
    })
  }

  /**
   * Closes server and releases all used resources.
   *
   * @returns {Promise<void>}
   */
  async close() {
    const state = this.#state
    const httpServer = this.#httpServer

    state.isClosing = true

    this.#removeListeners()

    if (process.env.NODE_ENV !== 'test' && cluster.isPrimary) {
      return new Promise((resolve) => {
        cluster.disconnect(resolve)
      })
    }

    return new Promise((resolve, reject) => {
      if (httpServer) {
        httpServer.close((error) => {
          state.isClosing = false

          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      } else {
        state.isClosing = false
        resolve()
      }
    })
  }

  /**
   * @returns {void}
   */
  #addListeners() {
    for (const signal of terminationSignals) {
      process.on(signal, async () => {
        logger.log(closingMockerText)
        await this.close()
      })
    }
  }

  /**
   * @returns {void}
   */
  #removeListeners() {
    for (const signal of terminationSignals) {
      process.removeAllListeners(signal)
    }
  }

  /**
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line complexity
  async #server(request, response) {
    const args = this.#args
    const connectionId = createId()

    response.setHeader('x-powered-by', 'mocker')

    logger.info(
      `${dim(connectionId)} 👉 ${bold(request.method)} ${bold(request.url)}`
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

    const requestRewindable = rewindable(request)

    if (args.cors && request.method === 'OPTIONS') {
      this.#handleCors(requestRewindable, response, connectionId)
      return
    }

    try {
      switch (args.mode) {
        case 'read': {
          await this.#handleConnectionWithReadMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'read-write': {
          await this.#handleConnectionWithReadWriteMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'read-pass': {
          await this.#handleConnectionWithReadPassMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'write':
        case 'pass': {
          await this.#respondFromOrigin(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'pass-read': {
          await this.#handleConnectionWithPassReadMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        default: {
          throw new TypeError(`invalid args.mode: ${args.mode}`)
        }
      }
    } catch (error) {
      logger.error(`${dim(connectionId)} ${error}`)

      response.writeHead(500)
      response.end()

      logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(500)}`)

      const errorCode = Reflect.get(error || {}, 'code')
      if (nonFatalErrors.includes(errorCode)) {
        return
      }

      throw error
    }
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithReadWriteMode(request, response, connectionId) {
    const mockManager = this.#mockManager

    const { hasMock, mockPath } = await mockManager.has({
      request,
      connectionId,
    })
    const mockBasename = path.basename(mockPath)

    if (hasMock) {
      await this.#respondFromMock(request, response, connectionId)
      return
    }

    logger.warn(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`
    )
    await this.#respondFromOrigin(request, response, connectionId)
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithReadPassMode(request, response, connectionId) {
    const mockManager = this.#mockManager

    const { hasMock, mockPath } = await mockManager.has({
      request,
      connectionId,
    })
    const mockBasename = path.basename(mockPath)

    if (hasMock) {
      await this.#respondFromMock(request, response, connectionId)
      return
    }

    logger.info(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`
    )
    await this.#respondFromOrigin(request, response, connectionId)
  }

  /**
   *@param {http.IncomingMessage} request
   *@param {http.ServerResponse} response
   *@param {string} connectionId
   *@returns {Promise<void>}
   */
  async #handleCors(request, response, connectionId) {
    logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(200)} CORS`)

    response.setHeader(
      'access-control-allow-origin',
      `${request.headers.origin}`
    )
    response.setHeader('access-control-allow-credentials', 'true')
    response.setHeader(
      'access-control-allow-methods',
      'PUT, GET, POST, DELETE, OPTIONS'
    )
    response.setHeader(
      'access-control-allow-headers',
      'Content-Type, x-cf-source-id, x-cf-corr-id'
    )
    response.end()
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithReadMode(request, response, connectionId) {
    const mockManager = this.#mockManager

    const { hasMock, mockPath } = await mockManager.has({
      request,
      connectionId,
    })
    const mockBasename = path.basename(mockPath)

    if (hasMock) {
      await this.#respondFromMock(request, response, connectionId)
      return
    }

    logger.warn(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`
    )
    await respondNotFound(response, connectionId)
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async #handleConnectionWithPassReadMode(request, response, connectionId) {
    const mockManager = this.#mockManager

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

      const { hasMock, mockPath } = await mockManager.has({
        request,
        connectionId,
      })
      const mockBasename = path.basename(mockPath)

      if (hasMock) {
        await this.#respondFromMock(request, response, connectionId)
        return
      }

      logger.warn(
        `${dim(connectionId)} mocked response "${mockBasename}" was not found`
      )
      await respondNotFound(response, connectionId)
      return
    }
  }

  /**
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async #respondFromMock(request, response, connectionId) {
    const args = this.#args
    const mockManager = this.#mockManager

    try {
      const { mockedResponse, mockPath } = await mockManager.get({
        request,
        connectionId,
      })
      const mockBasename = path.basename(mockPath)

      logger.info(
        `${dim(connectionId)} 👈 ${formatStatusCode(
          mockedResponse.statusCode
        )} serving from mocked response "${mockBasename}"`
      )

      response.statusCode = mockedResponse.statusCode
      response.setHeader('x-mocker-mock-path', mockPath)
      response.setHeader('x-mocker-response-from', 'Mock')
      response.setHeader('x-mocker-request-id', connectionId)
      for (const [key, value] of Object.entries(mockedResponse.headers)) {
        if (value === null || value === undefined) {
          continue
        }
        response.setHeader(key, value)
      }

      this.#overwriteResponseHeaders(response, request.headers)

      await pipeline(
        mockedResponse,
        delay({ ms: args.delay }),
        throttle({ bps: args.throttle }),
        response
      )
    } catch (error) {
      logger.error(
        `${dim(connectionId)} error reading mocked response from disk.`,
        error
      )

      response.writeHead(500)
      response.end()

      logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(500)}`)
    }
  }

  /**
   * @param {http.IncomingMessage & Rewindable} clientToProxyRequest
   * @param {http.ServerResponse} proxyToClientResponse
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async #respondFromOrigin(
    clientToProxyRequest,
    proxyToClientResponse,
    connectionId
  ) {
    const args = this.#args
    const origin = this.#origin
    const { method = undefined, url = '' } = clientToProxyRequest
    const requestHeaders = clientToProxyRequest.headers

    proxyToClientResponse.setHeader('x-mocker-request-id', connectionId)
    proxyToClientResponse.setHeader('x-mocker-response-from', 'Origin')

    const [proxyToOriginRequest, originToProxyResponsePromise] =
      await origin.request({
        url,
        headers: requestHeaders,
        method,
      })

    const [originToProxyResponse] = await Promise.all([
      originToProxyResponsePromise,
      pipeline(clientToProxyRequest.rewind(), proxyToOriginRequest),
    ])
    const originToProxyResponseRewindable = rewindable(originToProxyResponse)

    const originToProxyResponseStatusCode =
      originToProxyResponse?.statusCode ?? 500
    if (args.mode === 'pass-read' && originToProxyResponseStatusCode >= 500) {
      throw new OriginResponseError(`${originToProxyResponseStatusCode}`)
    }

    copyResponseAttrs(originToProxyResponse, proxyToClientResponse)
    this.#overwriteResponseHeaders(proxyToClientResponse, requestHeaders)

    await this.#writeMockIfOk(
      clientToProxyRequest,
      originToProxyResponseRewindable,
      connectionId
    )

    logger.info(
      `${dim(connectionId)} 👈 ${formatStatusCode(
        originToProxyResponse.statusCode
      )} serving from origin`
    )

    await pipeline(
      originToProxyResponseRewindable.rewind(),
      delay({ ms: args.delay }),
      throttle({ bps: args.throttle }),
      proxyToClientResponse
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

    if (args.cors) {
      response.setHeader(
        'access-control-allow-origin',
        `${requestHeaders.origin}`
      )
    }
  }

  /**
   * @param {(http.IncomingMessage | MockedRequest) & Rewindable} request
   * @param {http.IncomingMessage & Rewindable} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async #writeMockIfOk(request, response, connectionId) {
    const args = this.#args
    const mockManager = this.#mockManager

    if (!(args.mode === 'write' || args.mode === 'read-write')) return

    if (
      response.statusCode &&
      response.statusCode >= 200 &&
      response.statusCode < 300
    ) {
      try {
        const { mockPath } = await mockManager.set({
          request,
          response,
          connectionId,
        })
        const mockBasename = path.basename(mockPath)
        logger.info(
          `${dim(connectionId)} mock for request created on "${mockBasename}"`
        )
      } catch (error) {
        logger.error(`${dim(connectionId)} error while saving mock`, error)
      }
    } else {
      logger.warn(
        `${dim(
          connectionId
        )} not saving response from origin since status code is not ${formatStatusCode(
          200
        )} but ${formatStatusCode(response.statusCode)}`
      )
    }
  }

  /**
   * @param {Object} options
   * @param {Function} [options.fault] For fault injection.
   */
  // eslint-disable-next-line complexity
  async #updateMocks({ fault = () => {} } = {}) {
    const mockManager = this.#mockManager
    const origin = this.#origin
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

    for await (const {
      mockPath,
      mockedRequest,
      error,
    } of mockManager.getAll()) {
      const mockBasename = path.basename(mockPath)

      try {
        if (error) {
          throw error
        }

        fault()

        if (mockedRequest === null) continue // To make TypeScript happy.

        const [proxyToOriginRequest, originToProxyResponsePromise] =
          await origin.request({
            url: mockedRequest.url,
            headers: mockedRequest.headers,
            method: mockedRequest.method,
          })

        const [originToProxyResponse] = await Promise.all([
          (async () => {
            return rewindable(await originToProxyResponsePromise)
          })(),
          pipeline(mockedRequest.rewind(), proxyToOriginRequest),
        ])

        if (
          originToProxyResponse.statusCode &&
          originToProxyResponse.statusCode >= 200 &&
          originToProxyResponse.statusCode < 300
        ) {
          await mockManager.set({
            request: mockedRequest,
            response: originToProxyResponse,
          })
          logger.success(`${dim(progress())} ${bold(mockBasename)}`)
        } else {
          logger.warn(
            `${dim(progress())} ${bold(
              mockBasename
            )} request to origin errored. mock was not modified`
          )
        }
      } catch (error_) {
        if (error_ instanceof SecretNotFoundError) {
          logger.warn(
            `${dim(progress())} ${bold(mockBasename)} ${
              error_.message
            }. mock was not modified`
          )
        } else if (error_ && Reflect.get(error_, 'code') === 'EACCES') {
          logger.warn(
            `${dim(progress())} ${bold(
              mockBasename
            )} file is read-only. mock was not modified`
          )
        } else {
          logger.warn(
            `${dim(progress())} ${bold(
              mockBasename
            )} error while updating mock. mock was not modified`
          )
        }
      }

      i += 1
    }
  }
}

export default Mocker
