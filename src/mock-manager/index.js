/** @typedef {import('../shared/types.js').FsLike} FsLike */
/** @typedef {import('../shared/types.js').HttpIncomingMessage} HttpIncomingMessage */
/** @typedef {import('../shared/types.js').HttpServerResponse} HttpServerResponse */
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

const logger = createLogger()

const RESPONSE_FILE_REGEX = /\.json$/

/**
 * @param {string} input
 * @returns {string}
 */
function sha256(input) {
  return crypto.hash('sha256', input, 'hex')
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
 * @param {string} connectionId
 * @returns {string | Json}
 */
function parseBody(bodyBuffer, request, connectionId) {
  let body = bodyBuffer.toString()
  const headers = getHeaders(request)
  const headerContentType = /** @type {string} */ (
    headers?.['content-type'] ?? ''
  )
  if (headerContentType.includes('application/json')) {
    try {
      body = JSON.parse(body)
    } catch (_error) {
      // If we can't parse the request body to a JS object, we keep it as a
      // string
      logger.warn(
        `${dim(
          connectionId,
        )} error trying to parse response body. serving as is.`,
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
 * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} request
 * @param {string} connectionId
 * @param {Args['responsesDir']} responsesDir
 * @param {Args['mockKeys']} mockKeys
 * @returns {Promise<string>}
 */
async function requestToMockPath(
  request,
  connectionId,
  responsesDir,
  mockKeys,
) {
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
  fileName = `${sha256(fileName)}.json`

  const filePath = path.join(responsesDir, fileName)
  return filePath
}

/**
 * @param {Object} options
 * @param {Args['responsesDir']} options.responsesDir
 * @param {Args['mockKeys']} [options.mockKeys]
 * @param {Args['redactedHeaders']} [options.redactedHeaders]
 * @param {FsLike} [options.fs]
 */
function createMockManager({
  responsesDir,
  mockKeys = new Set(['url', 'method']),
  redactedHeaders = {},
  fs = nativeFs,
}) {
  const fsPromises = fs.promises

  /**
   * @param {Object} options
   * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} options.request
   * @param {string} [options.connectionId]
   * @returns {Promise<{ mockPath: string; hasMock: boolean }>}
   */
  async function has({ request, connectionId = '?' }) {
    const mockPath = await requestToMockPath(
      request,
      connectionId,
      responsesDir,
      mockKeys,
    )
    try {
      await fsPromises.access(mockPath)
      return { hasMock: true, mockPath }
    } catch (_) {
      return { hasMock: false, mockPath }
    }
  }

  /**
   * @param {Object} options
   * @param {(HttpIncomingMessage | MockedRequest) & Rewindable} options.request
   * @param {string} [options.connectionId]
   * @returns {Promise<{ mockPath: string; mockedResponse: MockedResponse }>}
   */
  async function get({ request, connectionId = '?' }) {
    const filePath = await requestToMockPath(
      request,
      connectionId,
      responsesDir,
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

    const mockedResponse = new MockedResponse({
      statusCode: fileJson.response.statusCode,
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
   * @param {string} [options.connectionId]
   * @param {Function} [options.fault] For fault injection.
   * @returns {Promise<{ mockPath: string }>}
   */
  async function set({
    request,
    response,
    connectionId = '?',
    fault = () => {},
  }) {
    const {
      createWriteStream,
      promises: { unlink },
    } = fs
    const filePath = await requestToMockPath(
      request,
      connectionId,
      responsesDir,
      mockKeys,
    )
    const reqBodyBuffer = await getBody(request.rewind())
    const resBodyBuffer = await getBody(response.rewind())
    const reqBody = parseBody(reqBodyBuffer, request, connectionId)

    /** @type {MockFile} */
    const fileContent = {
      request: {
        method: request.method || '',
        url: request.url || '',
        headers: getHeaders(request),
        body: reqBody,
      },
      response: {
        statusCode: response.statusCode || 0,
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
    const files = // @ts-ignore memfs typing mismatch
      /** @type {string[]} */ (await fsPromises.readdir(responsesDir))
    for (const file of files) {
      if (RESPONSE_FILE_REGEX.test(file)) {
        await fsPromises.unlink(path.join(responsesDir, file))
      }
    }
  }

  /**
   * @public
   * @returns {AsyncGenerator<{
   *   mockPath: string
   *   error: Error | null
   *   mockedResponse: (MockedResponse & Rewindable) | null
   *   mockedRequest: (MockedRequest & Rewindable) | null
   * }>}
   */
  // eslint-disable-next-line complexity
  async function* getAll() {
    const files = // @ts-ignore memfs typing mismatch
      /** @type {string[]} */ (await fsPromises.readdir(responsesDir))
    for (const file of files) {
      const filePath = path.join(responsesDir, file)
      if (!filePath.endsWith('.json')) {
        continue
      }

      try {
        const fileContent = await fsPromises.readFile(filePath)
        const fileJson = JSON.parse(fileContent.toString('utf8'))

        if (
          (fileJson.response.headers?.['content-type'] ?? '').includes(
            'application/json',
          )
        ) {
          fileJson.response.body = JSON.stringify(fileJson.response.body)
        }

        const mockedResponse = rewindable(
          new MockedResponse({
            statusCode: fileJson.response.statusCode,
            headers: unredactHeaders(
              fileJson.response.headers,
              redactedHeaders,
            ),
            url: fileJson.request.url || '',
          }),
        )
        mockedResponse.end(fileJson.response.body)

        if (
          (fileJson.request.headers?.['content-type'] ?? '').includes(
            'application/json',
          )
        ) {
          fileJson.request.body = JSON.stringify(fileJson.request.body)
        }

        const mockedRequest = rewindable(
          new MockedRequest({
            url: fileJson.request.url,
            headers: unredactHeaders(fileJson.request.headers, redactedHeaders),
            method: fileJson.request.method,
          }),
        )
        mockedRequest.end(fileJson.request.body)

        yield {
          mockPath: filePath,
          mockedResponse,
          mockedRequest,
          error: null,
        }
      } catch (error) {
        yield {
          error: error instanceof Error ? error : null,
          mockPath: filePath,
          mockedResponse: null,
          mockedRequest: null,
        }
      }
    }
  }

  /**
   * @public
   * @returns {Promise<number>}
   */
  async function size() {
    const files = // @ts-ignore memfs typing mismatch
      /** @type {string[]} */ (await fsPromises.readdir(responsesDir))
    let output = 0
    for (const file of files) {
      const filePath = path.join(responsesDir, file)
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
