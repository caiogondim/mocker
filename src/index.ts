import http from 'node:http'
import type { Socket as NetSocket } from 'node:net'
import path from 'node:path'
import packageJson from '../package.json' with { type: 'json' }
import { MODE } from './args/index.js'
import type { Args } from './args/types.js'
import { createMockManager } from './mock-manager/index.js'
import type { MockFileError } from './mock-manager/mock-file-error.js'
import type MockedRequest from './mock-manager/mocked-request.js'
import type MockedResponse from './mock-manager/mocked-response.js'
import { createOrigin } from './origin/index.js'
import createId from './shared/create-id/index.js'
import type { Headers } from './shared/http/index.js'
import {
  getHeaders,
  isHeaders,
  redactHeaders,
  SecretNotFoundError,
  stripHopByHopHeaders,
} from './shared/http/index.js'
import { HTTP_METHOD } from './shared/http-method/index.js'
import { HTTP_STATUS_CODE } from './shared/http-status-code/index.js'
import { bold, dim, green, red, yellow } from './shared/logger/format/index.js'
import createLogger from './shared/logger/index.js'
import { delay, pipeline, rewindable, throttle } from './shared/stream/index.js'
import type { Rewindable } from './shared/stream/rewindable/types.js'
import { toError } from './shared/try-catch/index.js'
import type {
  ConnectionId,
  FsLike,
  HttpMethod,
  Result,
} from './shared/types.js'

const logger = createLogger()
const closingMockerText = '\r  \nclosing mocker 👋'
const SHUTDOWN_TIMEOUT_MS = 3000

class OriginResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OriginResponseError'
  }
}

const terminationSignals = ['SIGHUP', 'SIGINT', 'SIGTERM']

/** Network error codes that indicate origin is unreachable (fallback to mock). */
const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'EAI_AGAIN',
])

function logUpdateError(
  error: unknown,
  mockBasename: string,
  progressStr: string,
) {
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
      error,
    )
  }
}

function copyResponseAttrs(
  responseSource: http.IncomingMessage,
  responseTarget: http.ServerResponse,
): void {
  const rawHeaders = getHeaders(responseSource)
  delete rawHeaders['content-length']
  const headers = stripHopByHopHeaders(rawHeaders)

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

async function respondNotFound(
  response: http.ServerResponse,
  connectionId: ConnectionId,
): Promise<void> {
  logger.info(
    `${dim(connectionId)} 👈 ${formatStatusCode(HTTP_STATUS_CODE.NOT_FOUND)}`,
  )

  response.setHeader('x-mocker-request-id', connectionId)
  response.setHeader('x-mocker-response-from', 'Mock')
  response.setHeader('x-mocker-mock-path', 'Not Found')
  response.writeHead(HTTP_STATUS_CODE.NOT_FOUND)
  response.end()
}

function formatStatusCode(statusCode: number | undefined): string {
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

function handleLiveAndReadinessConnection(
  _request: http.IncomingMessage,
  response: http.ServerResponse,
  connectionId: ConnectionId,
): void {
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
  #args: Args & { fs: FsLike }

  #origin: ReturnType<typeof createOrigin>

  #mockManager: ReturnType<typeof createMockManager>

  #httpServer: http.Server | null = null

  #connections: Set<NetSocket> = new Set()

  #closingPromise: Promise<void> | null = null

  #signalHandlers: (() => Promise<void>)[] = []

  constructor(args: Args & { fs: FsLike }) {
    this.#args = args

    this.#origin = createOrigin({
      host: args.origin,
      retries: args.retries,
      overwriteRequestHeaders: args.overwriteRequestHeaders,
      rewritePath: args.rewritePath,
      ...(args.proxy !== '' ? { proxyUrl: args.proxy } : {}),
    })

    this.#mockManager = createMockManager({
      mocksDir: args.mocksDir,
      mockKeys: args.mockKeys,
      redactedHeaders: args.redactedHeaders,
      fs: args.fs,
    })
  }

  get listening(): boolean {
    if (!this.#httpServer) return false
    return this.#httpServer.listening
  }

  get port(): number {
    const addr = this.#httpServer?.address()
    if (addr && typeof addr === 'object') return addr.port
    return 0
  }

  async listen(port = this.#args.port): Promise<void> {
    const args = this.#args

    function formatStartMessage() {
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

          if (entry[0] === 'rewritePath' && Array.isArray(entry[1])) {
            const formatted = (
              entry[1] as Array<{ prefix: string; replacement: string }>
            )
              .map((rule) => `${rule.prefix}=>${rule.replacement}`)
              .join(', ')
            return `- ${bold(entry[0])}: ${formatted}`
          }

          return `- ${bold(entry[0])}: ${entry[1]}`
        })
        .join('\n')}\n`
    }

    logger.log(formatStartMessage())
    this.#addListeners()

    if (args.update === 'startup' || args.update === 'only') {
      await this.#updateMocks()
    }

    if (args.update === 'only') {
      this.#removeListeners()
      logger.log(closingMockerText)
      return
    }

    return new Promise((resolve, reject) => {
      const httpServer = http.createServer(this.#server.bind(this))
      httpServer.on('connection', (socket) => {
        this.#connections.add(socket)
        socket.on('close', () => {
          this.#connections.delete(socket)
        })
      })
      httpServer.once('error', reject)
      this.#httpServer = httpServer.listen(port, () => {
        httpServer.removeListener('error', reject)
        logger.info(
          `started on port ${bold(port)}, with pid ${bold(
            process.pid,
          )}, and proxying ${bold(args.origin)}`,
        )
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    if (this.#closingPromise) {
      return this.#closingPromise
    }

    const httpServer = this.#httpServer

    this.#removeListeners()

    this.#closingPromise = new Promise((resolve, reject) => {
      if (httpServer?.listening) {
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

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }

  #addListeners(): void {
    for (const signal of terminationSignals) {
      const handler = async () => {
        if (this.#closingPromise) {
          return
        }
        logger.log(closingMockerText)
        await this.close()
      }
      this.#signalHandlers.push(handler)
      process.once(signal, handler)
    }
  }

  #removeListeners(): void {
    for (let i = 0; i < this.#signalHandlers.length; i++) {
      process.removeListener(terminationSignals[i], this.#signalHandlers[i])
    }
    this.#signalHandlers = []
  }

  async #dispatchByMode(
    request: http.IncomingMessage & Rewindable,
    response: http.ServerResponse,
    connectionId: ConnectionId,
  ): Promise<Result<undefined>> {
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
          await this.#handleConnectionWithReadOrForwardMode(
            request,
            response,
            connectionId,
            'warn',
          )
          return { ok: true, value: undefined }
        }
        case MODE.READ_PASS: {
          await this.#handleConnectionWithReadOrForwardMode(
            request,
            response,
            connectionId,
            'info',
          )
          return { ok: true, value: undefined }
        }
        case MODE.WRITE:
        case MODE.PASS: {
          const result = await this.#respondFromOrigin(
            request,
            response,
            connectionId,
          )
          if (!result.ok) return result
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
          const _exhaustiveCheck = args.mode as never
          return {
            ok: false,
            error: new TypeError(`invalid args.mode: ${_exhaustiveCheck}`),
          }
        }
      }
    } catch (error) {
      return { ok: false, error: toError(error) }
    }
  }

  async #server(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
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

      logger.info(
        `${dim(connectionId)} 👈 ${formatStatusCode(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)}`,
      )
      return
    }
    await using requestRewindable = requestRewindableResult.value

    if (args.cors && request.method === HTTP_METHOD.OPTIONS) {
      this.#handleCors(requestRewindable, response, connectionId)
      return
    }

    const result = await this.#dispatchByMode(
      requestRewindable,
      response,
      connectionId,
    )
    if (!result.ok) {
      logger.error(`${dim(connectionId)} ${result.error}`)

      if (!response.headersSent) {
        response.writeHead(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)
      }
      response.end()

      logger.info(
        `${dim(connectionId)} 👈 ${formatStatusCode(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)}`,
      )
    }
  }

  async #handleConnectionWithReadOrForwardMode(
    request: http.IncomingMessage & Rewindable,
    response: http.ServerResponse,
    connectionId: ConnectionId,
    logLevel: 'warn' | 'info',
  ): Promise<void> {
    const getResult = await this.#mockManager.get({ request, connectionId })
    if (getResult.ok) {
      await this.#serveFromMockResult(
        getResult.value,
        request,
        response,
        connectionId,
      )
      return
    }
    const mockBasename = path.basename(getResult.error.mockPath)
    logger[logLevel](
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`,
    )
    const originResult = await this.#respondFromOrigin(
      request,
      response,
      connectionId,
    )
    // Propagate origin failures so #dispatchByMode's try/catch turns them into
    // a failed Result, exactly as the previous throw did.
    if (!originResult.ok) {
      throw originResult.error
    }
  }

  async #handleCors(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    connectionId: ConnectionId,
  ): Promise<void> {
    logger.info(
      `${dim(connectionId)} 👈 ${formatStatusCode(HTTP_STATUS_CODE.OK)} CORS`,
    )

    if (request.headers.origin) {
      response.setHeader('access-control-allow-origin', request.headers.origin)
    }
    response.setHeader('vary', 'Origin')
    response.setHeader('access-control-allow-credentials', 'true')
    response.setHeader(
      'access-control-allow-methods',
      'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    )
    response.setHeader(
      'access-control-allow-headers',
      request.headers['access-control-request-headers'] || '*',
    )
    response.setHeader('access-control-max-age', '86400')
    response.end()
  }

  async #handleConnectionWithReadMode(
    request: http.IncomingMessage & Rewindable,
    response: http.ServerResponse,
    connectionId: ConnectionId,
  ): Promise<void> {
    const getResult = await this.#mockManager.get({ request, connectionId })
    if (getResult.ok) {
      await this.#serveFromMockResult(
        getResult.value,
        request,
        response,
        connectionId,
      )
      return
    }
    const mockBasename = path.basename(getResult.error.mockPath)
    logger.warn(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`,
    )
    await respondNotFound(response, connectionId)
  }

  async #handleConnectionWithPassReadMode(
    request: http.IncomingMessage & Rewindable,
    response: http.ServerResponse,
    connectionId: ConnectionId,
  ): Promise<void> {
    const originResult = await this.#respondFromOrigin(
      request,
      response,
      connectionId,
    )
    if (originResult.ok) {
      return
    }

    const error = originResult.error
    const errorCode = Reflect.get(error || {}, 'code')
    const isNetworkError =
      error instanceof OriginResponseError || NETWORK_ERROR_CODES.has(errorCode)
    if (!isNetworkError) {
      // Non-network errors are propagated so #dispatchByMode's try/catch turns
      // them into a failed Result, exactly as before.
      throw error
    }

    logger.warn(`${dim(connectionId)} error fetching from origin`)

    const getResult = await this.#mockManager.get({ request, connectionId })
    if (getResult.ok) {
      await this.#serveFromMockResult(
        getResult.value,
        request,
        response,
        connectionId,
      )
      return
    }
    const mockBasename = path.basename(getResult.error.mockPath)
    logger.warn(
      `${dim(connectionId)} mocked response "${mockBasename}" was not found`,
    )
    await respondNotFound(response, connectionId)
  }

  async #serveFromMockResult(
    {
      mockedResponse,
      mockPath,
    }: { mockedResponse: MockedResponse; mockPath: string },
    request: http.IncomingMessage & Rewindable,
    response: http.ServerResponse,
    connectionId: ConnectionId,
  ): Promise<void> {
    const args = this.#args
    const mockBasename = path.basename(mockPath)

    logger.info(
      `${dim(connectionId)} 👈 ${formatStatusCode(mockedResponse.statusCode)} serving from mocked response "${mockBasename}"`,
    )

    response.statusCode = mockedResponse.statusCode
    response.setHeader('x-mocker-mock-path', mockPath)
    response.setHeader('x-mocker-response-from', 'Mock')
    response.setHeader('x-mocker-request-id', connectionId)
    for (const [key, value] of Object.entries(mockedResponse.headers)) {
      if (value === null || value === undefined) continue
      response.setHeader(key, value)
    }

    this.#overwriteResponseHeaders(response, request.headers as Headers)

    try {
      await pipeline(
        mockedResponse,
        delay({ ms: args.delay }),
        throttle({ bps: args.throttle }),
        response,
      )
    } catch (error) {
      logger.error(`${dim(connectionId)} error piping mocked response.`, error)
      if (!response.headersSent) {
        response.writeHead(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)
      }
      response.end()
      logger.info(
        `${dim(connectionId)} 👈 ${formatStatusCode(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR)}`,
      )
    }
  }

  async #respondFromOrigin(
    clientToProxyRequest: http.IncomingMessage & Rewindable,
    proxyToClientResponse: http.ServerResponse,
    connectionId: ConnectionId,
  ): Promise<Result<undefined>> {
    const args = this.#args
    const origin = this.#origin
    const { method, url = '' } = clientToProxyRequest
    const requestHeaders = clientToProxyRequest.headers

    proxyToClientResponse.setHeader('x-mocker-request-id', connectionId)
    proxyToClientResponse.setHeader('x-mocker-response-from', 'Origin')

    const requestResult = await origin.request({
      url,
      headers: stripHopByHopHeaders(requestHeaders as Headers),
      method: method as HttpMethod | undefined,
    })

    if (!requestResult.ok) {
      return { ok: false, error: requestResult.error }
    }

    const [proxyToOriginRequest, originToProxyResponsePromise] =
      requestResult.value

    // Everything past the successful `origin.request()` runs inside this
    // try/catch so that a mid-stream failure (e.g. the origin dropping the
    // connection with ECONNRESET while the response body streams, surfacing as
    // a rejection of the Promise.all below) is returned as a failed Result
    // rather than thrown. Callers — notably #handleConnectionWithPassReadMode —
    // classify that error and fall back to a stored mock, matching the
    // pre-Result behavior where the whole call was wrapped in a try/catch.
    try {
      const [originToProxyResponse] = await Promise.all([
        originToProxyResponsePromise,
        pipeline(clientToProxyRequest.rewind(), proxyToOriginRequest),
      ])
      const originToProxyResponseRewindableResult = rewindable(
        originToProxyResponse,
      )
      if (!originToProxyResponseRewindableResult.ok) {
        return { ok: false, error: originToProxyResponseRewindableResult.error }
      }
      await using originToProxyResponseRewindable =
        originToProxyResponseRewindableResult.value

      const originToProxyResponseStatusCode =
        originToProxyResponse?.statusCode ??
        HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR
      if (
        args.mode === MODE.PASS_READ &&
        originToProxyResponseStatusCode >= 500
      ) {
        return {
          ok: false,
          error: new OriginResponseError(`${originToProxyResponseStatusCode}`),
        }
      }

      copyResponseAttrs(originToProxyResponse, proxyToClientResponse)
      this.#overwriteResponseHeaders(
        proxyToClientResponse,
        requestHeaders as Headers,
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

      try {
        await pipeline(
          originToProxyResponseRewindable.rewind(),
          delay({ ms: args.delay }),
          throttle({ bps: args.throttle }),
          proxyToClientResponse,
        )
      } catch (error) {
        logger.error(
          `${dim(connectionId)} error piping origin response.`,
          error,
        )
        if (!proxyToClientResponse.headersSent) {
          proxyToClientResponse.writeHead(
            HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR,
          )
        }
        proxyToClientResponse.end()
      }

      return { ok: true, value: undefined }
    } catch (error) {
      return { ok: false, error: toError(error) }
    }
  }

  #overwriteResponseHeaders(
    response: http.ServerResponse,
    requestHeaders: Headers,
  ): void {
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
      response.setHeader('vary', 'Origin')
    }
  }

  async #writeMockIfOk(
    request: (http.IncomingMessage | MockedRequest) & Rewindable,
    response: http.IncomingMessage & Rewindable,
    connectionId: ConnectionId,
  ): Promise<void> {
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
        logger.error(
          `${dim(connectionId)} error while saving mock`,
          setResult.error,
        )
      }
    } else {
      logger.warn(
        `${dim(
          connectionId,
        )} not saving response from origin since status code is not 2xx but ${formatStatusCode(response.statusCode)}`,
      )
    }
  }

  async #updateMock(
    item: Result<
      { mockPath: string; mockedRequest: MockedRequest & Rewindable },
      MockFileError
    >,
    progressStr: string,
  ): Promise<Result<undefined>> {
    if (!item.ok) return { ok: false, error: item.error }

    const mockBasename = path.basename(item.value.mockPath)
    const { mockedRequest } = item.value

    const requestResult = await this.#origin.request({
      url: mockedRequest.url,
      headers: mockedRequest.headers,
      method: mockedRequest.method,
    })

    if (!requestResult.ok) {
      return { ok: false, error: requestResult.error }
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
    await using originToProxyResponse = originToProxyResponseResult

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

    return { ok: true, value: undefined }
  }

  async #updateMocks() {
    const mockManager = this.#mockManager
    const total = await mockManager.size()
    let completedCount = 1

    if (total === 0) {
      logger.warn('no mocks in the responses folder, skipping mocks update')
      return
    }

    logger.info(`updating ${bold(total)} mocks...`)

    function progress() {
      return `[${`${completedCount}`.padStart(`${total}`.length, '0')}/${total}]`
    }

    for await (const item of mockManager.getAll()) {
      const mockPath = item.ok ? item.value.mockPath : item.error.mockPath
      const mockBasename = path.basename(mockPath)

      try {
        let updateResult: Result<undefined>
        if (item.ok) {
          await using mockedRequest = item.value.mockedRequest
          await using mockedResponse = item.value.mockedResponse
          void mockedResponse

          updateResult = await this.#updateMock(
            {
              ok: true,
              value: {
                mockPath: item.value.mockPath,
                mockedRequest,
              },
            },
            progress(),
          )
        } else {
          updateResult = await this.#updateMock(item, progress())
        }
        // For the item.ok branch, the `await using` resources were declared in
        // the inner `if` block, which has now exited, so they are disposed
        // before this log — matching the original throw-then-catch ordering.
        if (!updateResult.ok) {
          logUpdateError(updateResult.error, mockBasename, progress())
        }
      } catch (error_) {
        logUpdateError(error_, mockBasename, progress())
      }

      completedCount += 1
    }
  }
}

export default Mocker
