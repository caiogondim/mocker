/** @typedef {import('../shared/types.js').FsLike} FsLike */
/** @typedef {import('../shared/types.js').HttpIncomingMessage} HttpIncomingMessage */
/** @typedef {import('../shared/types.js').HttpServerResponse} HttpServerResponse */
/** @typedef {import('../shared/types.js').ConnectionId} ConnectionId */
/** @import { Result } from '../shared/types.js' */
/** @typedef {import('../shared/types.js').HttpStatusCode} HttpStatusCode */
/** @typedef {import('./types.js').MockFile} MockFile */
/** @typedef {import('./types.js').RequestFile} RequestFile */
/** @typedef {import('../args/types.js').Args} Args */
/** @typedef {import('../shared/http/types.js').Headers} Headers */
/** @typedef {import('../shared/stream/rewindable/types.js').Rewindable} Rewindable */
/** @typedef {import('../shared/types.js').Json} Json */
/** @typedef {'br' | 'deflate' | 'gzip'} ContentEncodingToken */
/** @typedef {typeof import('node:fs/promises')} FsPromises */
/** @typedef {(input: Buffer) => Promise<Buffer>} Decompressor */

import path from 'node:path'
import nativeFs from 'node:fs'
import { isUtf8 } from 'node:buffer'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import MockedResponse from './mocked-response.js'
import {
  getBody,
  getHeaders,
  redactHeaders,
  unredactHeaders,
} from '../shared/http/index.js'
import { rewindable } from '../shared/stream/index.js'
import createLogger from '../shared/logger/index.js'
import { dim } from '../shared/logger/format/index.js'
import MockedRequest from './mocked-request.js'
import { parse as parseHttpStatusCode } from '../shared/http-status-code/index.js'
import { parse as parseHttpMethod } from '../shared/http-method/index.js'
import { tryCatch, tryCatchAsync } from '../shared/try-catch/index.js'
import { MockFileError } from './mock-file-error.js'
import atomicWrite from '../shared/atomic-write/index.js'

class MockGetError extends Error {
  /** @param {string} mockPath @param {Error} cause */
  constructor(mockPath, cause) {
    super(cause.message, { cause })
    this.name = 'MockGetError'
    this.mockPath = mockPath
  }
}

const logger = createLogger()

const RESPONSE_FILE_REGEX = /\.json$/
const MAX_FILENAME_LENGTH = 80
const BODY_ENCODING_BASE64 = 'base64'

/** @type {Record<ContentEncodingToken, Decompressor>} */
const decompressorsByEncoding = {
  br: promisify(zlib.brotliDecompress),
  deflate: promisify(zlib.inflate),
  gzip: promisify(zlib.gunzip),
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidStatusCode(value) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
  )
}

/**
 * @param {string} value
 * @returns {value is ContentEncodingToken}
 */
function isSupportedContentEncoding(value) {
  return Object.prototype.hasOwnProperty.call(decompressorsByEncoding, value)
}

/**
 * @param {string} contentEncoding
 * @returns {{ encodings: ContentEncodingToken[]; hasUnsupported: boolean }}
 */
function parseContentEncodings(contentEncoding) {
  /** @type {ContentEncodingToken[]} */
  const output = []
  let hasUnsupported = false

  for (const rawToken of `${contentEncoding}`.split(',')) {
    const token = rawToken.trim().toLowerCase()
    if (token === '' || token === 'identity') {
      continue
    }
    if (!isSupportedContentEncoding(token)) {
      hasUnsupported = true
      continue
    }
    output.push(token)
  }

  return { encodings: output, hasUnsupported }
}

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
 * @returns {Result<string>}
 */
function getGraphQLFileName(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: new TypeError('body is not a plain object') }
  }

  const { operationName, query } = /** @type {Record<string, unknown>} */ (body)

  if (typeof operationName !== 'string' || operationName === '') {
    return { ok: false, error: new TypeError('missing operationName') }
  }

  if (typeof query !== 'string') {
    return { ok: false, error: new TypeError('missing query') }
  }

  // Extract query type (query/mutation/subscription) from the query string
  const match = query.match(/^\s*(query|mutation|subscription)\b/)
  const queryType = match ? match[1] : 'operation'

  const safeName = toSafeSlug(operationName.replace(/([a-z])([A-Z])/g, '$1-$2'))

  if (safeName === '') {
    return { ok: true, value: `gql-${queryType}-operation` }
  }

  return { ok: true, value: `gql-${queryType}-${safeName}` }
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
 * @returns {Promise<{ body: Buffer; fullyDecompressed: boolean }>}
 */
async function uncompressBody(buffer, algorithm) {
  if (buffer.length === 0) {
    return { body: buffer, fullyDecompressed: true }
  }

  const { encodings, hasUnsupported } = parseContentEncodings(algorithm)

  if (hasUnsupported) {
    return { body: buffer, fullyDecompressed: false }
  }

  let output = buffer
  for (let i = encodings.length - 1; i >= 0; i -= 1) {
    output = await decompressorsByEncoding[encodings[i]](output)
  }

  return { body: output, fullyDecompressed: true }
}

/**
 * @param {Buffer} bodyBuffer
 * @param {  | HttpIncomingMessage
 *   | MockedRequest
 *   | HttpServerResponse
 *   | MockedResponse} request
 * @param {ConnectionId} connectionId
 * @returns {string | Json | { encoding: 'base64'; data: string }}
 */
function parseBody(bodyBuffer, request, connectionId) {
  const headers = getHeaders(request)
  const headerContentType = /** @type {string} */ (
    headers?.['content-type'] ?? ''
  )

  if (isTextualContentType(headerContentType)) {
    const charset = parseCharset(headerContentType)
    if (charset && !isNodeSupportedEncoding(charset)) {
      return {
        encoding: BODY_ENCODING_BASE64,
        data: bodyBuffer.toString('base64'),
      }
    }
    return bodyBuffer.toString(resolveCharset(charset || 'utf8'))
  }

  if (isJsonContentType(headerContentType)) {
    const bodyString = stripBom(bodyBuffer.toString())
    const parseResult = tryCatch(() => JSON.parse(bodyString))
    if (parseResult.ok) {
      return /** @type {Json} */ (parseResult.value)
    }
    logger.warn(
      `${dim(connectionId)} error trying to parse response body. serving as is.`,
    )
    return bodyString
  }

  if (isUtf8TextBody(bodyBuffer)) {
    return bodyBuffer.toString()
  }

  return {
    encoding: BODY_ENCODING_BASE64,
    data: bodyBuffer.toString('base64'),
  }
}

/**
 * @param {string} contentType
 * @returns {string | undefined}
 */
function parseCharset(contentType) {
  const match = contentType.match(/charset=([^\s;]+)/i)
  if (!match) return undefined
  return match[1].toLowerCase().replace(/^["']|["']$/g, '')
}

const NODE_SUPPORTED_ENCODINGS = new Set([
  'utf8',
  'utf-8',
  'ascii',
  'latin1',
  'binary',
  'base64',
  'hex',
  'ucs2',
  'ucs-2',
  'utf16le',
  'utf-16le',
])

/** @type {Record<string, BufferEncoding>} */
const CHARSET_ALIASES = {
  'iso-8859-1': 'latin1',
  'iso-8859-15': 'latin1',
  'us-ascii': 'ascii',
  'windows-1252': 'latin1',
}

/**
 * @param {string} charset
 * @returns {boolean}
 */
function isNodeSupportedEncoding(charset) {
  return NODE_SUPPORTED_ENCODINGS.has(charset) || charset in CHARSET_ALIASES
}

/**
 * @param {string} charset
 * @returns {BufferEncoding}
 */
function resolveCharset(charset) {
  if (charset in CHARSET_ALIASES) {
    return CHARSET_ALIASES[charset]
  }
  return /** @type {BufferEncoding} */ (charset)
}

/**
 * @param {string} str
 * @returns {string}
 */
function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str
}

/**
 * @param {string} contentType
 * @returns {boolean}
 */
function isJsonContentType(contentType) {
  return (
    contentType.includes('application/json') || contentType.includes('+json')
  )
}

/**
 * @param {string} contentType
 * @returns {boolean}
 */
function isTextualContentType(contentType) {
  return (
    contentType.startsWith('text/') ||
    contentType.includes('application/xml') ||
    contentType.includes('+xml') ||
    contentType.includes('application/javascript') ||
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('application/graphql') ||
    contentType.includes('application/yaml') ||
    contentType.includes('+yaml')
  )
}

/**
 * @param {Buffer} bodyBuffer
 * @returns {boolean}
 */
function isUtf8TextBody(bodyBuffer) {
  return isUtf8(bodyBuffer)
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
 * @param {boolean} [fullyDecompressed]
 * @returns {Headers}
 */
function sanitizeResponseHeaders(headers, secrets, fullyDecompressed = true) {
  // `redactHeaders` creates a copy of `headers` so we don't need to call `clone`
  const headersClone = redactHeaders(headers, secrets)

  // Only remove `content-encoding` when body was fully decompressed.
  // If the body uses an unsupported encoding (e.g. zstd), preserve the header
  // so clients know the body is still compressed.
  if (fullyDecompressed && 'content-encoding' in headersClone) {
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
  for (const mockKey of mockKeys) {
    if (mockKey === 'body' || mockKey.startsWith('body.')) {
      const gqlResult = getGraphQLFileName(body)
      return gqlResult.ok
        ? gqlResult.value
        : getHttpFileName(request.url, request.method, mockKeys)
    }
  }
  return getHttpFileName(request.url, request.method, mockKeys)
}

/**
 * @param {string} dotPath
 * @param {unknown} body
 * @returns {unknown}
 */
function resolveBodyPath(dotPath, body) {
  const root = Array.isArray(body) ? body[0] : body
  const props = dotPath.split('.').slice(1)
  return props.reduce(
    (/** @type {unknown} */ obj, key) =>
      obj !== null && typeof obj === 'object' && !Array.isArray(obj)
        ? /** @type {Record<string, unknown>} */ (obj)[key]
        : undefined,
    /** @type {unknown} */ (root),
  )
}

/**
 * @param {HttpIncomingMessage | MockedRequest} request
 * @param {Buffer} reqBody
 * @param {unknown} body
 * @param {Args['mockKeys']} mockKeys
 * @returns {string}
 */
function buildMockKeyFingerprint(request, reqBody, body, mockKeys) {
  const parts = []
  for (const mockKey of mockKeys) {
    if (mockKey === 'method' || mockKey === 'url') {
      parts.push(JSON.stringify(request[mockKey]))
    } else if (mockKey === 'headers') {
      const headers = getHeaders(request)
      delete headers['content-length']
      parts.push(JSON.stringify(headers))
    } else if (mockKey === 'body') {
      parts.push(String(reqBody))
    } else if (mockKey.startsWith('body.') && typeof body === 'object') {
      const bodyVal = resolveBodyPath(mockKey, body)
      if (bodyVal !== undefined) {
        parts.push(JSON.stringify(bodyVal))
      }
    }
  }
  return parts.join(' ')
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

  const fingerprint = buildMockKeyFingerprint(request, reqBody, body, mockKeys)

  const hash = shortHash(fingerprint)
  const label = buildLabel(body, request, mockKeys)
  // Total: {hash}-{label}.json = 12 + 1 + label + 5 = 80 → label max = 62
  const maxLabelLength = MAX_FILENAME_LENGTH - hash.length - 1 - '.json'.length
  const truncatedLabel = label.slice(0, maxLabelLength)
  const fileName = `${hash}-${truncatedLabel}.json`

  return path.join(mocksDir, fileName)
}

/**
 * @param {{ headers?: Record<string, unknown>; body: unknown }} part
 * @returns {string | Buffer}
 */
function serializeBody(part) {
  if (
    part.body &&
    typeof part.body === 'object' &&
    !Array.isArray(part.body) &&
    Reflect.get(part.body, 'encoding') === BODY_ENCODING_BASE64 &&
    typeof Reflect.get(part.body, 'data') === 'string'
  ) {
    return Buffer.from(
      /** @type {string} */ (Reflect.get(part.body, 'data')),
      BODY_ENCODING_BASE64,
    )
  }

  const contentType = `${part.headers?.['content-type'] ?? ''}`
  if (isJsonContentType(contentType)) {
    return JSON.stringify(part.body)
  }
  return part.body == null ? '' : String(part.body)
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} fileJson
 * @returns {Result<MockFile>}
 */
function validateMockFileShape(fileJson) {
  if (!isRecord(fileJson)) {
    return { ok: false, error: new TypeError('Mock file is not an object') }
  }

  const request = Reflect.get(fileJson, 'request')
  const response = Reflect.get(fileJson, 'response')
  if (!isRecord(request) || !isRecord(response)) {
    return {
      ok: false,
      error: new TypeError(
        'Mock file must include request and response objects',
      ),
    }
  }

  const requestHeaders = Reflect.get(request, 'headers')
  const responseHeaders = Reflect.get(response, 'headers')
  if (!isRecord(requestHeaders) || !isRecord(responseHeaders)) {
    return {
      ok: false,
      error: new TypeError('Mock file headers must be objects'),
    }
  }

  const requestMethod = Reflect.get(request, 'method')
  const requestUrl = Reflect.get(request, 'url')
  const responseStatusCode = Reflect.get(response, 'statusCode')
  if (typeof requestMethod !== 'string' || typeof requestUrl !== 'string') {
    return {
      ok: false,
      error: new TypeError(
        'Mock file request.method and request.url must be strings',
      ),
    }
  }
  if (!isValidStatusCode(responseStatusCode)) {
    return {
      ok: false,
      error: new TypeError(
        'Mock file response.statusCode must be an integer between 100 and 599',
      ),
    }
  }

  return { ok: true, value: /** @type {MockFile} */ (fileJson) }
}

/**
 * @param {MockFile} fileJson
 * @param {HttpStatusCode} statusCode
 * @param {Headers} redactedHeaders
 * @returns {Result<{ mockedResponse: MockedResponse & Rewindable; mockedRequest: MockedRequest & Rewindable }, Error>}
 */
function buildMockedPair(fileJson, statusCode, redactedHeaders) {
  const responseHeadersResult = unredactHeaders(
    fileJson.response.headers,
    redactedHeaders,
  )
  if (!responseHeadersResult.ok) return responseHeadersResult

  const mockedResponseResult = rewindable(
    new MockedResponse({
      statusCode,
      headers: responseHeadersResult.value,
      url: fileJson.request.url || '',
    }),
  )
  if (!mockedResponseResult.ok) return mockedResponseResult
  mockedResponseResult.value.end(serializeBody(fileJson.response))

  const requestHeadersResult = unredactHeaders(
    fileJson.request.headers,
    redactedHeaders,
  )
  if (!requestHeadersResult.ok) return requestHeadersResult

  const mockedRequestResult = rewindable(
    new MockedRequest({
      url: fileJson.request.url,
      headers: requestHeadersResult.value,
      method: fileJson.request.method,
    }),
  )
  if (!mockedRequestResult.ok) return mockedRequestResult
  mockedRequestResult.value.end(serializeBody(fileJson.request))

  return {
    ok: true,
    value: {
      mockedResponse: mockedResponseResult.value,
      mockedRequest: mockedRequestResult.value,
    },
  }
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
  const fsPromises = /** @type {FsPromises} */ (fs.promises)

  /**
   * @param {string} filePath
   * @returns {Promise<Result<MockFile>>}
   */
  async function readMockFile(filePath) {
    const readResult = await tryCatchAsync(() => fsPromises.readFile(filePath))
    if (!readResult.ok) return readResult

    const parseResult = tryCatch(() =>
      JSON.parse(readResult.value.toString('utf8')),
    )
    if (!parseResult.ok) return parseResult
    return validateMockFileShape(parseResult.value)
  }

  /**
   * @param {Object} options
   * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} options.request
   * @param {ConnectionId} [options.connectionId]
   * @returns {Promise<Result<{ mockPath: string; mockedResponse: MockedResponse }, MockGetError>>}
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

    const fileResult = await readMockFile(filePath)
    if (!fileResult.ok)
      return { ok: false, error: new MockGetError(filePath, fileResult.error) }

    const fileJson = fileResult.value

    const statusCodeResult = parseHttpStatusCode(fileJson.response.statusCode)
    if (!statusCodeResult.ok)
      return {
        ok: false,
        error: new MockGetError(filePath, statusCodeResult.error),
      }

    const unredactResult = unredactHeaders(
      fileJson.response.headers,
      redactedHeaders,
    )
    if (!unredactResult.ok)
      return {
        ok: false,
        error: new MockGetError(filePath, unredactResult.error),
      }

    const mockedResponse = new MockedResponse({
      statusCode: statusCodeResult.value,
      headers: unredactResult.value,
      url: fileJson.request.url || request.url || '',
      connectionId,
    })
    mockedResponse.end(serializeBody(fileJson.response))

    return {
      ok: true,
      value: {
        mockPath: filePath,
        mockedResponse,
      },
    }
  }

  /**
   * @param {Object} options
   * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} options.request
   * @param {(HttpIncomingMessage | MockedResponse) & Rewindable} options.response
   * @param {ConnectionId} [options.connectionId]
   * @returns {Promise<Result<{ mockPath: string }>>}
   */
  async function set({
    request,
    response,
    connectionId = /** @type {ConnectionId} */ ('?'),
  }) {
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
    if (!methodResult.ok) return methodResult

    const statusCodeResult = parseHttpStatusCode(response.statusCode || 0)
    if (!statusCodeResult.ok) return statusCodeResult

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
    const compressionAlgorithm = `${fileContent.response.headers['content-encoding'] ?? ''}`
    const { body: resBodyUncompressedBuffer, fullyDecompressed } =
      await uncompressBody(resBodyBuffer, compressionAlgorithm)
    const resBody = parseBody(resBodyUncompressedBuffer, response, connectionId)
    fileContent.response.body = resBody

    // Now is safe to sanitize the request and response
    fileContent.response.headers = sanitizeResponseHeaders(
      fileContent.response.headers,
      redactedHeaders,
      fullyDecompressed,
    )
    fileContent.request.headers = sanitizeRequestHeaders(
      fileContent.request.headers,
      redactedHeaders,
    )

    const fileContentSerialized = JSON.stringify(fileContent, null, 2)

    const writeResult = await atomicWrite({
      filePath,
      content: fileContentSerialized,
      fs,
    })
    if (!writeResult.ok) return writeResult

    return {
      ok: true,
      value: { mockPath: filePath },
    }
  }

  async function clear() {
    const files = /** @type {string[]} */ (await fsPromises.readdir(mocksDir))
    for (const file of files) {
      if (RESPONSE_FILE_REGEX.test(file)) {
        try {
          await fsPromises.unlink(path.join(mocksDir, file))
        } catch (error) {
          if (
            !(error instanceof Error) ||
            Reflect.get(error, 'code') !== 'ENOENT'
          ) {
            throw error
          }
        }
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

      const readResult = await tryCatchAsync(() =>
        fsPromises.readFile(filePath),
      )
      if (!readResult.ok) {
        yield {
          ok: false,
          error: new MockFileError(readResult.error, filePath),
        }
        continue
      }

      const parseResult = tryCatch(() =>
        JSON.parse(readResult.value.toString('utf8')),
      )
      if (!parseResult.ok) {
        yield {
          ok: false,
          error: new MockFileError(parseResult.error, filePath),
        }
        continue
      }

      const shapeResult = validateMockFileShape(parseResult.value)
      if (!shapeResult.ok) {
        yield {
          ok: false,
          error: new MockFileError(shapeResult.error, filePath),
        }
        continue
      }
      const fileJson = shapeResult.value

      const statusCodeResult = parseHttpStatusCode(fileJson.response.statusCode)
      if (!statusCodeResult.ok) {
        yield {
          ok: false,
          error: new MockFileError(statusCodeResult.error, filePath),
        }
        continue
      }

      const buildResult = buildMockedPair(
        fileJson,
        statusCodeResult.value,
        redactedHeaders,
      )
      if (!buildResult.ok) {
        yield {
          ok: false,
          error: new MockFileError(buildResult.error, filePath),
        }
        continue
      }

      yield {
        ok: true,
        value: { mockPath: filePath, ...buildResult.value },
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

  return { get, set, clear, getAll, size }
}

export { createMockManager, MockGetError }
