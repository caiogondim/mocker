import type { Args } from '../args/types.js'
import type { Headers } from '../shared/http/types.js'
import type { Rewindable } from '../shared/stream/rewindable/types.js'
import type {
  ConnectionId,
  FsLike,
  HttpIncomingMessage,
  HttpServerResponse,
  HttpStatusCode,
  Json,
  Result,
} from '../shared/types.js'
import type { MockFile } from './types.js'

type ContentEncodingToken = 'br' | 'deflate' | 'gzip'
type FsPromises = typeof import('node:fs/promises')
type Decompressor = (input: Buffer) => Promise<Buffer>

import { isUtf8 } from 'node:buffer'
import crypto from 'node:crypto'
import nativeFs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import atomicWrite from '../shared/atomic-write/index.js'
import {
  getBody,
  getHeaders,
  redactHeaders,
  unredactHeaders,
} from '../shared/http/index.js'
import { parse as parseHttpMethod } from '../shared/http-method/index.js'
import { parse as parseHttpStatusCode } from '../shared/http-status-code/index.js'
import { dim } from '../shared/logger/format/index.js'
import createLogger from '../shared/logger/index.js'
import { rewindable } from '../shared/stream/index.js'
import { tryCatch, tryCatchAsync } from '../shared/try-catch/index.js'
import { MockFileError } from './mock-file-error.js'
import MockedRequest from './mocked-request.js'
import MockedResponse from './mocked-response.js'

class MockGetError extends Error {
  mockPath: string

  constructor(mockPath: string, cause: Error) {
    super(cause.message, { cause })
    this.name = 'MockGetError'
    this.mockPath = mockPath
  }
}

const logger = createLogger()

const RESPONSE_FILE_REGEX = /\.json$/
const MAX_FILENAME_LENGTH = 80
const BODY_ENCODING_BASE64 = 'base64'

const decompressorsByEncoding: Record<ContentEncodingToken, Decompressor> = {
  br: promisify(zlib.brotliDecompress),
  deflate: promisify(zlib.inflate),
  gzip: promisify(zlib.gunzip),
}

function isValidStatusCode(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
  )
}

function isSupportedContentEncoding(
  value: string,
): value is ContentEncodingToken {
  return Object.hasOwn(decompressorsByEncoding, value)
}

function parseContentEncodings(contentEncoding: string): {
  encodings: ContentEncodingToken[]
  hasUnsupported: boolean
} {
  const output: ContentEncodingToken[] = []
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

function toSafeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function shortHash(input: string): string {
  return crypto.hash('sha256', input, 'hex').slice(0, 12)
}

function getGraphQLFileName(body: unknown): Result<string> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: new TypeError('body is not a plain object') }
  }

  const { operationName, query } = body as Record<string, unknown>

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

function getHttpFileName(
  url: string | undefined,
  method: string | undefined,
  mockKeys: Args['mockKeys'],
): string {
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

async function uncompressBody(
  buffer: Buffer,
  algorithm: string,
): Promise<{ body: Buffer; fullyDecompressed: boolean }> {
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

function parseBody(
  bodyBuffer: Buffer,
  request:
    | HttpIncomingMessage
    | MockedRequest
    | HttpServerResponse
    | MockedResponse,
  connectionId: ConnectionId,
): string | Json | { encoding: 'base64'; data: string } {
  const headers = getHeaders(request)
  const headerContentType = (headers?.['content-type'] ?? '') as string

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
      return parseResult.value as Json
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

function parseCharset(contentType: string): string | undefined {
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

const CHARSET_ALIASES: Record<string, BufferEncoding> = {
  'iso-8859-1': 'latin1',
  'iso-8859-15': 'latin1',
  'us-ascii': 'ascii',
  'windows-1252': 'latin1',
}

function isNodeSupportedEncoding(charset: string): boolean {
  return NODE_SUPPORTED_ENCODINGS.has(charset) || charset in CHARSET_ALIASES
}

function resolveCharset(charset: string): BufferEncoding {
  if (charset in CHARSET_ALIASES) {
    return CHARSET_ALIASES[charset]
  }
  return charset as BufferEncoding
}

function stripBom(str: string): string {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str
}

function isJsonContentType(contentType: string): boolean {
  return (
    contentType.includes('application/json') || contentType.includes('+json')
  )
}

function isTextualContentType(contentType: string): boolean {
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

function isUtf8TextBody(bodyBuffer: Buffer): boolean {
  return isUtf8(bodyBuffer)
}

function sanitizeRequestHeaders(headers: Headers, secrets: Headers): Headers {
  // `redactHeaders` creates a copy of `headers` so we don't need to call `clone`
  const headersClone = redactHeaders(headers, secrets)

  if ('content-length' in headersClone) {
    delete headersClone['content-length']
  }

  return headersClone
}

function sanitizeResponseHeaders(
  headers: Headers,
  secrets: Headers,
  fullyDecompressed = true,
): Headers {
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

function buildLabel(
  body: unknown,
  request: HttpIncomingMessage | MockedRequest,
  mockKeys: Args['mockKeys'],
): string {
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

function resolveBodyPath(dotPath: string, body: unknown): unknown {
  const root = Array.isArray(body) ? body[0] : body
  const props = dotPath.split('.').slice(1)
  return props.reduce(
    (obj: unknown, key) =>
      obj !== null && typeof obj === 'object' && !Array.isArray(obj)
        ? (obj as Record<string, unknown>)[key]
        : undefined,
    root as unknown,
  )
}

function buildMockKeyFingerprint(
  request: HttpIncomingMessage | MockedRequest,
  reqBody: Buffer,
  body: unknown,
  mockKeys: Args['mockKeys'],
): string {
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

async function requestToMockPath(
  request: (HttpIncomingMessage | MockedRequest) & Rewindable,
  connectionId: ConnectionId,
  mocksDir: Args['mocksDir'],
  mockKeys: Args['mockKeys'],
): Promise<string> {
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

function serializeBody(part: {
  headers?: Record<string, unknown>
  body: unknown
}): string | Buffer {
  if (
    part.body &&
    typeof part.body === 'object' &&
    !Array.isArray(part.body) &&
    Reflect.get(part.body, 'encoding') === BODY_ENCODING_BASE64 &&
    typeof Reflect.get(part.body, 'data') === 'string'
  ) {
    return Buffer.from(
      Reflect.get(part.body, 'data') as string,
      BODY_ENCODING_BASE64,
    )
  }

  const contentType = `${part.headers?.['content-type'] ?? ''}`
  if (isJsonContentType(contentType)) {
    return JSON.stringify(part.body)
  }
  return part.body == null ? '' : String(part.body)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateMockFileShape(fileJson: unknown): Result<MockFile> {
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

  return { ok: true, value: fileJson as MockFile }
}

function buildMockedPair(
  fileJson: MockFile,
  statusCode: HttpStatusCode,
  redactedHeaders: Headers,
): Result<
  {
    mockedResponse: MockedResponse & Rewindable
    mockedRequest: MockedRequest & Rewindable
  },
  Error
> {
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

function createMockManager({
  mocksDir,
  mockKeys = new Set(['url', 'method']),
  redactedHeaders = {},
  fs = nativeFs,
}: {
  mocksDir: Args['mocksDir']
  mockKeys?: Args['mockKeys']
  redactedHeaders?: Args['redactedHeaders']
  fs?: FsLike
}) {
  const fsPromises = fs.promises as FsPromises

  async function readMockFile(filePath: string): Promise<Result<MockFile>> {
    const readResult = await tryCatchAsync(() => fsPromises.readFile(filePath))
    if (!readResult.ok) return readResult

    const parseResult = tryCatch(() =>
      JSON.parse(readResult.value.toString('utf8')),
    )
    if (!parseResult.ok) return parseResult
    return validateMockFileShape(parseResult.value)
  }

  async function get({
    request,
    connectionId = '?' as ConnectionId,
  }: {
    request: (HttpIncomingMessage | MockedRequest) & Rewindable
    connectionId?: ConnectionId
  }): Promise<
    Result<{ mockPath: string; mockedResponse: MockedResponse }, MockGetError>
  > {
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

  async function set({
    request,
    response,
    connectionId = '?' as ConnectionId,
  }: {
    request: (HttpIncomingMessage | MockedRequest) & Rewindable
    response: (HttpIncomingMessage | MockedResponse) & Rewindable
    connectionId?: ConnectionId
  }): Promise<Result<{ mockPath: string }>> {
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

    const fileContent: MockFile = {
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
    const files = (await fsPromises.readdir(mocksDir)) as string[]
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

  async function* getAll(): AsyncGenerator<
    Result<
      {
        mockPath: string
        mockedResponse: MockedResponse & Rewindable
        mockedRequest: MockedRequest & Rewindable
      },
      MockFileError
    >
  > {
    const files = (await fsPromises.readdir(mocksDir)) as string[]
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

  async function size(): Promise<number> {
    const files = (await fsPromises.readdir(mocksDir)) as string[]
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
