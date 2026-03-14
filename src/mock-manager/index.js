/** @typedef {import('../shared/types.js').FsLike} FsLike */
/** @typedef {import('../shared/types.js').HttpIncomingMessage} HttpIncomingMessage */
/** @typedef {import('../shared/types.js').HttpServerResponse} HttpServerResponse */
/** @typedef {import('../shared/types.js').ConnectionId} ConnectionId */
/** @template T @template {Error} [E=Error] @typedef {import('../shared/types.js').Result<T, E>} Result */
/** @typedef {import('../shared/types.js').HttpStatusCode} HttpStatusCode */
/** @typedef {import('./types.js').MockFile} MockFile */
/** @typedef {import('./types.js').RequestFile} RequestFile */
/** @typedef {import('../args/types.js').Args} Args */
/** @typedef {import('../shared/http/types.js').Headers} Headers */
/** @typedef {import('../shared/stream/rewindable/types.js').Rewindable} Rewindable */
/** @typedef {import('../shared/types.js').Json} Json */

import path from 'node:path'
import nativeFs from 'node:fs'
import zlib from 'node:zlib'
import { Readable } from 'node:stream'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import MockedResponse from './mocked-response.js'
import {
  getBody,
  getHeaders,
  redactHeaders,
  unredactHeaders,
} from '../shared/http/index.js'
import { pipeline, rewindable } from '../shared/stream/index.js'
import createLogger from '../shared/logger/index.js'
import { dim } from '../shared/logger/format/index.js'
import MockedRequest from './mocked-request.js'
import { parse as parseHttpStatusCode } from '../shared/http-status-code/index.js'
import { parse as parseHttpMethod } from '../shared/http-method/index.js'
import { tryCatch, tryCatchAsync } from '../shared/try-catch/index.js'
import { MockFileError } from './mock-file-error.js'

const logger = createLogger()

const RESPONSE_FILE_REGEX = /\.json$/
const MAX_FILENAME_LENGTH = 80

/**
 * @param {string} value
 * @returns {string}
 */
function toSafeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * @param {string} input
 * @returns {string}
 */
function shortHash(input) {
  return crypto.hash('sha256', input, 'hex').slice(0, 12)
}

/**
 * @param {unknown} body
 * @returns {string}
 */
function getGraphQLFileName(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return ''
  }

  const { operationName, query } = /** @type {Record<string, unknown>} */ (body)

  if (typeof operationName !== 'string' || operationName === '') {
    return ''
  }

  if (typeof query !== 'string') {
    return ''
  }

  // Extract query type (query/mutation/subscription) from the query string
  const match = query.match(/^\s*(query|mutation|subscription)\b/)
  const queryType = match ? match[1] : 'operation'

  const safeName = toSafeSlug(operationName.replace(/([a-z])([A-Z])/g, '$1-$2'))

  if (safeName === '') {
    return `gql-${queryType}-operation`
  }

  return `gql-${queryType}-${safeName}`
}

/**
 * @param {string | undefined} url
 * @param {string | undefined} method
 * @param {Args['mockKeys']} mockKeys
 * @returns {string}
 */
function getHttpFileName(url, method, mockKeys) {
  const parts = ['http']

  if (mockKeys.has('method')) {
    parts.push((method || 'get').toLowerCase())
  }

  if (mockKeys.has('url')) {
    const urlResult = tryCatch(() => new URL(url || '/', 'http://localhost'))
    const pathname = urlResult.ok ? urlResult.value.pathname : url || '/'

    const safePath = toSafeSlug(
      pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '-'),
    )

    if (safePath) {
      parts.push(safePath)
    }
  }

  return parts.join('-')
}

/**
 * @param {Buffer} buffer
 * @param {string} algorithm
 * @returns {Promise<Buffer>}
 */
async function uncompressBody(buffer, algorithm) {
  if (buffer.length === 0) {
    return buffer
  }

  /**
   * @param {Buffer} x
   * @returns {Promise<Buffer>}
   */
  let uncompressLib = async (x) => x

  switch (algorithm) {
    case 'br':
      uncompressLib = promisify(zlib.brotliDecompress)
      break
    case 'deflate':
      uncompressLib = promisify(zlib.inflate)
      break
    case 'gzip':
      uncompressLib = promisify(zlib.gunzip)
      break
    default:
      break
  }

  return uncompressLib(buffer)
}

/**
 * @param {Buffer} bodyBuffer
 * @param {  | HttpIncomingMessage
 *   | MockedRequest
 *   | HttpServerResponse
 *   | MockedResponse} request
 * @param {ConnectionId} connectionId
 * @returns {string | Json}
 */
function parseBody(bodyBuffer, request, connectionId) {
  let body = bodyBuffer.toString()
  const headers = getHeaders(request)
  const headerContentType = /** @type {string} */ (
    headers?.['content-type'] ?? ''
  )
  if (headerContentType.includes('application/json')) {
    const parseResult = tryCatch(() => JSON.parse(body))
    if (parseResult.ok) {
      body = parseResult.value
    } else {
      logger.warn(
        `${dim(connectionId)} error trying to parse response body. serving as is.`,
      )
    }
  }

  return body
}

/**
 * @param {Headers} headers
 * @param {Headers} secrets
 * @returns {Headers}
 */
function sanitizeRequestHeaders(headers, secrets) {
  // `redactHeaders` creates a copy of `headers` so we don't need to call `clone`
  const headersClone = redactHeaders(headers, secrets)

  if ('content-length' in headersClone) {
    delete headersClone['content-length']
  }

  return headersClone
}

/**
 * @param {Headers} headers
 * @param {Headers} secrets
 * @returns {Headers}
 */
function sanitizeResponseHeaders(headers, secrets) {
  // `redactHeaders` creates a copy of `headers` so we don't need to call `clone`
  const headersClone = redactHeaders(headers, secrets)

  // Remove `content-encoding` header since we always serve non-compressed assets.
  if ('content-encoding' in headersClone) {
    delete headersClone['content-encoding']
  }

  // Remove `content-length` since the response body size is modified.
  if ('content-length' in headersClone) {
    delete headersClone['content-length']
  }

  return headersClone
}

/**
 * @param {unknown} body
 * @param {HttpIncomingMessage | MockedRequest} request
 * @param {Args['mockKeys']} mockKeys
 * @returns {string}
 */
function buildLabel(body, request, mockKeys) {
  for (const k of mockKeys) {
    if (k === 'body' || k.startsWith('body.')) {
      return (
        getGraphQLFileName(body) ||
        getHttpFileName(request.url, request.method, mockKeys)
      )
    }
  }
  return getHttpFileName(request.url, request.method, mockKeys)
}

/**
 * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} request
 * @param {ConnectionId} connectionId
 * @param {Args['mocksDir']} mocksDir
 * @param {Args['mockKeys']} mockKeys
 * @returns {Promise<string>}
 */
async function requestToMockPath(request, connectionId, mocksDir, mockKeys) {
  const reqBody = await getBody(request.rewind())
  const body = parseBody(reqBody, request, connectionId)

  let fileName = ''
  for (const mockKey of mockKeys) {
    if (mockKey === 'method' || mockKey === 'headers' || mockKey === 'url') {
      fileName = `${fileName} ${JSON.stringify(request[mockKey])}`
    } else if (mockKey === 'body') {
      fileName = `${fileName} ${reqBody}`
    } else if (mockKey.startsWith('body.') && typeof body === 'object') {
      const props = mockKey.split('.').slice(1)
      const bodyVal = props.reduce(
        (/** @type {unknown} */ obj, key) =>
          obj !== null && typeof obj === 'object'
            ? /** @type {Record<string, unknown>} */ (obj)[key]
            : undefined,
        /** @type {unknown} */ (body),
      )

      if (bodyVal === undefined) {
        continue
      }

      fileName = `${fileName} ${JSON.stringify(bodyVal)}`
    }
  }

  fileName = fileName.trim()

  const hash = shortHash(fileName)
  const label = buildLabel(body, request, mockKeys)
  // Total: {hash}-{label}.json = 12 + 1 + label + 5 = 80 → label max = 62
  const maxLabelLength = MAX_FILENAME_LENGTH - hash.length - 1 - '.json'.length
  const truncatedLabel = label.slice(0, maxLabelLength)
  fileName = `${hash}-${truncatedLabel}.json`

  const filePath = path.join(mocksDir, fileName)
  return filePath
}

/**
 * @param {MockFile} fileJson
 * @param {HttpStatusCode} statusCode
 * @param {Headers} redactedHeaders
 * @returns {{ mockedResponse: MockedResponse & Rewindable; mockedRequest: MockedRequest & Rewindable }}
 */
function buildMockedPair(fileJson, statusCode, redactedHeaders) {
  const responseBody =
    `${fileJson.response.headers?.['content-type'] ?? ''}`.includes(
      'application/json',
    )
      ? JSON.stringify(fileJson.response.body)
      : fileJson.response.body

  const mockedResponse = rewindable(
    new MockedResponse({
      statusCode,
      headers: unredactHeaders(fileJson.response.headers, redactedHeaders),
      url: fileJson.request.url || '',
    }),
  )
  mockedResponse.end(responseBody)

  const requestBody =
    `${fileJson.request.headers?.['content-type'] ?? ''}`.includes(
      'application/json',
    )
      ? JSON.stringify(fileJson.request.body)
      : fileJson.request.body

  const mockedRequest = rewindable(
    new MockedRequest({
      url: fileJson.request.url,
      headers: unredactHeaders(fileJson.request.headers, redactedHeaders),
      method: fileJson.request.method,
    }),
  )
  mockedRequest.end(requestBody)

  return { mockedResponse, mockedRequest }
}

/**
 * @param {Object} options
 * @param {Args['mocksDir']} options.mocksDir
 * @param {Args['mockKeys']} [options.mockKeys]
 * @param {Args['redactedHeaders']} [options.redactedHeaders]
 * @param {FsLike} [options.fs]
 */
function createMockManager({
  mocksDir,
  mockKeys = new Set(['url', 'method']),
  redactedHeaders = {},
  fs = nativeFs,
}) {
  const fsPromises = /** @type {typeof import('node:fs/promises')} */ (
    fs.promises
  )

  /**
   * @param {Object} options
   * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} options.request
   * @param {ConnectionId} [options.connectionId]
   * @returns {Promise<{ mockPath: string; hasMock: boolean }>}
   */
  async function has({
    request,
    connectionId = /** @type {ConnectionId} */ ('?'),
  }) {
    const mockPath = await requestToMockPath(
      request,
      connectionId,
      mocksDir,
      mockKeys,
    )
    const accessResult = await tryCatchAsync(() => fsPromises.access(mockPath))
    return { hasMock: accessResult.ok, mockPath }
  }

  /**
   * @param {Object} options
   * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} options.request
   * @param {ConnectionId} [options.connectionId]
   * @returns {Promise<{ mockPath: string; mockedResponse: MockedResponse }>}
   */
  async function get({
    request,
    connectionId = /** @type {ConnectionId} */ ('?'),
  }) {
    const filePath = await requestToMockPath(
      request,
      connectionId,
      mocksDir,
      mockKeys,
    )
    const fileContent = await fsPromises.readFile(filePath)
    const fileJson = JSON.parse(fileContent.toString('utf8'))

    if (
      (fileJson.response.headers?.['content-type'] ?? '').includes(
        'application/json',
      )
    ) {
      fileJson.response.body = JSON.stringify(fileJson.response.body)
    }

    const statusCodeResult = parseHttpStatusCode(fileJson.response.statusCode)
    if (!statusCodeResult.ok) throw statusCodeResult.error

    const mockedResponse = new MockedResponse({
      statusCode: statusCodeResult.value,
      headers: unredactHeaders(fileJson.response.headers, redactedHeaders),
      url: fileJson.request.url || request.url || '',
      connectionId,
    })
    mockedResponse.end(fileJson.response.body)

    return {
      mockPath: filePath,
      mockedResponse,
    }
  }

  /**
   * @param {Object} options
   * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} options.request
   * @param {(HttpIncomingMessage | MockedResponse) & Rewindable} options.response
   * @param {ConnectionId} [options.connectionId]
   * @param {Function} [options.fault]
   * @returns {Promise<{ mockPath: string }>}
   */
  async function set({
    request,
    response,
    connectionId = /** @type {ConnectionId} */ ('?'),
    fault = () => {},
  }) {
    const {
      createWriteStream,
      promises: { unlink },
    } = fs
    const filePath = await requestToMockPath(
      request,
      connectionId,
      mocksDir,
      mockKeys,
    )
    const reqBodyBuffer = await getBody(request.rewind())
    const resBodyBuffer = await getBody(response.rewind())
    const reqBody = parseBody(reqBodyBuffer, request, connectionId)

    const methodResult = parseHttpMethod(request.method)
    if (!methodResult.ok) throw methodResult.error

    const statusCodeResult = parseHttpStatusCode(response.statusCode || 0)
    if (!statusCodeResult.ok) throw statusCodeResult.error

    /** @type {MockFile} */
    const fileContent = {
      request: {
        method: methodResult.value,
        url: request.url || '',
        headers: getHeaders(request),
        body: reqBody,
      },
      response: {
        statusCode: statusCodeResult.value,
        headers: getHeaders(response),
        body: '',
      },
    }

    // We need the raw values from response to uncompress the body
    const compressionAlgorithm = `${fileContent.response.headers['content-encoding']}`
    const resBodyUncompressedBuffer = await uncompressBody(
      resBodyBuffer,
      compressionAlgorithm,
    )
    const resBody = parseBody(resBodyUncompressedBuffer, response, connectionId)
    fileContent.response.body = resBody

    // Now is safe to sanitize the request and response
    fileContent.response.headers = sanitizeResponseHeaders(
      fileContent.response.headers,
      redactedHeaders,
    )
    fileContent.request.headers = sanitizeRequestHeaders(
      fileContent.request.headers,
      redactedHeaders,
    )

    const fileContentSerialized = JSON.stringify(fileContent, null, 2)

    try {
      await pipeline(
        Readable.from(fileContentSerialized),
        createWriteStream(filePath, { autoClose: true }),
      )
      fault()
    } catch (error) {
      // Deletes a file if there is an error while writing to it to avoid having
      // a corrupted file.
      // If the error is "no write access", do nothing.
      if (error && Reflect.get(error, 'code') !== 'EACCES') {
        await unlink(filePath)
      }

      throw error
    }

    return {
      mockPath: filePath,
    }
  }

  async function clear() {
    const files = /** @type {string[]} */ (await fsPromises.readdir(mocksDir))
    for (const file of files) {
      if (RESPONSE_FILE_REGEX.test(file)) {
        await fsPromises.unlink(path.join(mocksDir, file))
      }
    }
  }

  /**
   * @public
   * @returns {AsyncGenerator<Result<{
   *   mockPath: string;
   *   mockedResponse: MockedResponse & Rewindable;
   *   mockedRequest: MockedRequest & Rewindable;
   * }, MockFileError>>}
   */
  async function* getAll() {
    const files = /** @type {string[]} */ (await fsPromises.readdir(mocksDir))
    for (const file of files) {
      const filePath = path.join(mocksDir, file)
      if (!filePath.endsWith('.json')) {
        continue
      }

      try {
        const fileContent = await fsPromises.readFile(filePath)
        const fileJson = JSON.parse(fileContent.toString('utf8'))

        const statusCodeResult = parseHttpStatusCode(
          fileJson.response.statusCode,
        )
        if (!statusCodeResult.ok) throw statusCodeResult.error

        const { mockedResponse, mockedRequest } = buildMockedPair(
          fileJson,
          statusCodeResult.value,
          redactedHeaders,
        )

        yield {
          ok: true,
          value: { mockPath: filePath, mockedResponse, mockedRequest },
        }
      } catch (error) {
        yield {
          ok: false,
          error: new MockFileError(
            error instanceof Error ? error : new Error(String(error)),
            filePath,
          ),
        }
      }
    }
  }

  /**
   * @public
   * @returns {Promise<number>}
   */
  async function size() {
    const files = /** @type {string[]} */ (await fsPromises.readdir(mocksDir))
    let output = 0
    for (const file of files) {
      const filePath = path.join(mocksDir, file)
      if (!filePath.endsWith('.json')) {
        continue
      }
      output += 1
    }
    return output
  }

  return { has, get, set, clear, getAll, size }
}

export { createMockManager }
