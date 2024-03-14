/** @typedef {import('./args').Args} Args */
/** @typedef {import('./shared/types').AsyncHttpServer} AsyncHttpServer */
/** @typedef {import('./shared/types').FsLike} FsLike */
/** @typedef {import('./shared/stream/rewindable/types').Rewindable} Rewindable */
/** @typedef {import('./shared/http').Headers} Headers */
/** @typedef {import('./mock-manager/mocked-request')} MockedRequest */

const path = require('path')
const http = require('http')
const cluster = require('cluster')
const os = require('os')
const packageJson = require('../package.json')
const Logger = require('./shared/logger')
const { bold, dim, green, yellow, red } = require('./shared/logger/format')
const { MockManager } = require('./mock-manager')
const { Origin } = require('./origin')
const clone = require('./shared/clone')
const { delay, throttle, pipeline, rewindable } = require('./shared/stream')
const createId = require('./shared/create-id')
const {
  getHeaders,
  redactHeaders,
  isHeaders,
  SecretNotFoundError,
} = require('./shared/http')

const logger = new Logger()
const closingMockerText = '\r  \nclosing mocker 👋'

class OriginResponseError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'OriginResponseError'
  }
}

const terminationSignals = ['SIGHUP', 'SIGINT', 'SIGTERM']

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

  if (responseSource.statusMessage) {
    responseTarget.statusCode = responseSource.statusCode || 200
    responseTarget.statusMessage = responseSource.statusMessage
    for (const [key, value] of Object.entries(headers)) {
      responseTarget.setHeader(key, value)
    }
  } else {
    responseTarget.statusCode = responseSource.statusCode || 200
    for (const [key, value] of Object.entries(headers)) {
      responseTarget.setHeader(key, value)
    }
  }
}

/**
 * @param {http.ServerResponse} response
 * @param {string} connectionId
 * @returns {Promise<void>}
 */
async function respondNotFound(response, connectionId) {
  logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(404)}`)

  response.setHeader('x-nyt-mocker-request-id', connectionId)
  response.setHeader('x-nyt-mocker-response-from', 'Mock')
  response.setHeader('x-nyt-mocker-mock-path', 'Not Found')
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
  /** @param {Args & { fs: FsLike }} args */
  constructor(args) {
    /**
     * @private
     * @readonly
     */
    this._args = args

    /**
     * @private
     * @readonly
     */
    this._origin = new Origin({
      host: args.origin,
      retries: args.retries,
      overwriteRequestHeaders: args.overwriteRequestHeaders,
    })

    /**
     * @private
     * @readonly
     */
    this._mockManager = new MockManager({
      responsesDir: args.responsesDir,
      mockKeys: args.mockKeys,
      redactedHeaders: args.redactedHeaders,
      fs: args.fs,
    })

    /**
     * @private
     * @type {http.Server | null}
     */
    this._httpServer = null

    this._state = {
      isClosing: false,
    }

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
    if (!this._httpServer) return false
    return this._httpServer.listening
  }

  /**
   * Binds server to a TCP port.
   *
   * @param {number} port
   * @returns {Promise<void>}
   */
  async listen(port = this._args.port) {
    const { _args: args, _state: state } = this

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

    // Type definition for cluster module is broken
    // @ts-expect-error
    if (cluster.isPrimary) {
      logger.log(printStartMessage())

      this._addListeners()

      if (args.update === 'startup' || args.update === 'only') {
        await this._updateMocks()
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
        this._httpServer = http
          .createServer(this._server.bind(this))
          .listen(port, resolve)
        // Type definition for cluster module is broken
        // @ts-expect-error
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
          // Type definition for cluster module is broken
          // @ts-expect-error
          cluster.fork()
        }

        // Type definition for cluster module is broken
        // @ts-expect-error
        cluster.on('online', (worker) => {
          logger.info(`worker pid ${bold(worker.process.pid)} started`)
        })

        // Type definition for cluster module is broken
        // @ts-expect-error
        cluster.on('exit', (worker) => {
          if (!state.isClosing) {
            logger.warn(`worker pid ${bold(worker.process.pid)} died`)

            // Type definition for cluster module is broken
            // @ts-expect-error
            cluster.fork()
          }
        })

        // Type definition for cluster module is broken
        // @ts-expect-error
        cluster.on('listening', resolve)

        // Type definition for cluster module is broken
        // @ts-expect-error
      } else if (cluster.isWorker) {
        this._httpServer = http
          .createServer(this._server.bind(this))
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
    const { _state: state, _httpServer: httpServer } = this

    state.isClosing = true

    this._removeListeners()

    // Type definition for cluster module is broken
    // @ts-expect-error
    if (process.env.NODE_ENV !== 'test' && cluster.isPrimary) {
      return new Promise((resolve) => {
        // Type definition for cluster module is broken
        // @ts-expect-error
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
   * @private
   * @returns {void}
   */
  _addListeners() {
    for (const signal of terminationSignals) {
      process.on(signal, async () => {
        logger.log(closingMockerText)
        await this.close()
      })
    }
  }

  /**
   * @private
   * @returns {void}
   */
  _removeListeners() {
    for (const signal of terminationSignals) {
      process.removeAllListeners(signal)
    }
  }

  /**
   * @private
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line complexity
  async _server(request, response) {
    const { _args: args } = this
    const connectionId = createId()

    response.setHeader('x-powered-by', 'NYT Mocker')

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
      this._handleCors(requestRewindable, response, connectionId)
      return
    }

    try {
      switch (args.mode) {
        case 'read': {
          await this._handleConnectionWithReadMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'read-write': {
          await this._handleConnectionWithReadWriteMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'read-pass': {
          await this._handleConnectionWithReadPassMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'write': {
          await this._handleConnectionWithWriteMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'pass': {
          await this._handleConnectionWithPassMode(
            requestRewindable,
            response,
            connectionId
          )
          return
        }
        case 'pass-read': {
          await this._handleConnectionWithPassReadMode(
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

      throw error
    }
  }

  /**
   * @private
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _handleConnectionWithWriteMode(request, response, connectionId) {
    await this._respondFromOrigin(request, response, connectionId)
  }

  /**
   * @private
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _handleConnectionWithPassMode(request, response, connectionId) {
    await this._respondFromOrigin(request, response, connectionId)
  }

  /**
   * @private
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _handleConnectionWithReadWriteMode(request, response, connectionId) {
    const { _mockManager: mockManager } = this

    const { hasMock, mockPath } = await mockManager.has({
      request,
      connectionId,
    })
    const mockBasename = path.basename(mockPath)

    if (hasMock) {
      await this._respondFromMock(request, response, connectionId)
      return
    }

    logger.warn(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`
    )
    await this._respondFromOrigin(request, response, connectionId)
  }

  /**
   * @private
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _handleConnectionWithReadPassMode(request, response, connectionId) {
    const { _mockManager: mockManager } = this

    const { hasMock, mockPath } = await mockManager.has({
      request,
      connectionId,
    })
    const mockBasename = path.basename(mockPath)

    if (hasMock) {
      await this._respondFromMock(request, response, connectionId)
      return
    }

    logger.info(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`
    )
    await this._respondFromOrigin(request, response, connectionId)
  }

  /**
   *@private
   *@param {http.IncomingMessage} request
   *@param {http.ServerResponse} response
   *@param {string} connectionId
   *@returns {Promise<void>}
   */
  async _handleCors(request, response, connectionId) {
    logger.info(`${dim(connectionId)} 👈 ${formatStatusCode(200)} CORS`)

    response.setHeader('access-control-allow-origin', `${request.headers.origin}`)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader(
      'Access-Control-Allow-Methods',
      'PUT, GET, POST, DELETE, OPTIONS'
    )
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, x-cf-source-id, x-cf-corr-id'
    )
    response.end()
  }

  /**
   * @private
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _handleConnectionWithReadMode(request, response, connectionId) {
    const { _mockManager: mockManager } = this

    const { hasMock, mockPath } = await mockManager.has({
      request,
      connectionId,
    })
    const mockBasename = path.basename(mockPath)

    if (hasMock) {
      await this._respondFromMock(request, response, connectionId)
      return
    }

    logger.warn(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`
    )
    await respondNotFound(response, connectionId)
  }

  /**
   * @private
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _handleConnectionWithPassReadMode(request, response, connectionId) {
    const { _mockManager: mockManager } = this

    try {
      await this._respondFromOrigin(request, response, connectionId)
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
        await this._respondFromMock(request, response, connectionId)
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
   * @private
   * @param {http.IncomingMessage & Rewindable} request
   * @param {http.ServerResponse} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _respondFromMock(request, response, connectionId) {
    const { _args: args, _mockManager: mockManager } = this

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
      response.setHeader('x-nyt-mocker-mock-path', mockPath)
      response.setHeader('x-nyt-mocker-response-from', 'Mock')
      response.setHeader('x-nyt-mocker-request-id', connectionId)
      for (const [key, value] of Object.entries(mockedResponse.headers)) {
        if (value === null || value === undefined) {
          continue
        }
        response.setHeader(key, value)
      }

      this._overwriteResponseHeaders(response, request.headers)

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
   * @private
   * @param {http.IncomingMessage & Rewindable} clientToProxyRequest
   * @param {http.ServerResponse} proxyToClientResponse
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _respondFromOrigin(
    clientToProxyRequest,
    proxyToClientResponse,
    connectionId
  ) {
    const { _args: args, _origin: origin } = this
    const { method = undefined, url = '' } = clientToProxyRequest
    const requestHeaders = clone(clientToProxyRequest.headers)

    proxyToClientResponse.setHeader('x-nyt-mocker-request-id', connectionId)
    proxyToClientResponse.setHeader('x-nyt-mocker-response-from', 'Origin')

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
    this._overwriteResponseHeaders(proxyToClientResponse, requestHeaders)

    await this._writeMockIfOk(
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
   * @private
   * @param {http.ServerResponse} response
   * @param {Headers} requestHeaders
   * @returns {void}
   */
  _overwriteResponseHeaders(response, requestHeaders) {
    const { _args: args } = this

    for (const [key, value] of Object.entries(args.overwriteResponseHeaders)) {
      if (value === null || value === undefined) {
        response.removeHeader(key)
      } else {
        response.setHeader(key, value)
      }
    }

    if (args.cors) {
      response.setHeader('access-control-allow-origin', `${requestHeaders.origin}`)
    }
  }

  /**
   * @private
   * @param {(http.IncomingMessage | MockedRequest) & Rewindable} request
   * @param {http.IncomingMessage & Rewindable} response
   * @param {string} connectionId
   * @returns {Promise<void>}
   */
  async _writeMockIfOk(request, response, connectionId) {
    const { _args: args, _mockManager: mockManager } = this

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
   * @private
   * @param {Object} options
   * @param {Function} [options.fault] For fault injection.
   */
  // eslint-disable-next-line complexity
  async _updateMocks({ fault = () => {} } = {}) {
    const { _mockManager: mockManager, _origin: origin } = this
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

module.exports = Mocker
