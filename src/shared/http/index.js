/** @typedef {import('node:stream').Readable} Readable */
/** @typedef {import('./types.js').RequestWrite} RequestWrite */
/** @typedef {InstanceType<import('../../mock-manager/mocked-request.js')["default"]>} MockedRequest */
/** @typedef {InstanceType<import('../../mock-manager/mocked-response.js')["default"]>} MockedResponse */
/** @typedef {import('../types.js').HttpIncomingMessage} HttpIncomingMessage */
/** @typedef {import('../types.js').HttpServerResponse} HttpServerResponse */
/** @typedef {import('./types.js').Headers} Headers */
/** @template T @template {Error} [E=Error] @typedef {import('../types.js').Result<T, E>} Result */

import getConstructorName from '../get-constructor-name/index.js'
import createRequest from './request/index.js'
import {
  redactHeaders,
  unredactHeaders,
  SecretNotFoundError,
} from './redact-headers/index.js'
import values from '../stream/values/index.js'

/**
 * @param {Readable} req
 * @returns {Promise<Buffer>}
 */
async function getBody(req) {
  const streamValues = await values(req)
  return Buffer.concat(streamValues)
}

/**
 * @param {  | HttpIncomingMessage
 *   | MockedRequest
 *   | HttpServerResponse
 *   | MockedResponse} reqOrRes
 * @returns {Headers}
 */
function getHeaders(reqOrRes) {
  /** @type {Record<string, unknown>} */
  let raw = {}

  if ('headers' in reqOrRes) {
    raw = /** @type {Record<string, unknown>} */ (structuredClone(reqOrRes.headers))
  } else if ('getHeaders' in reqOrRes && typeof reqOrRes.getHeaders === 'function') {
    raw = /** @type {Record<string, unknown>} */ (structuredClone(reqOrRes.getHeaders()))
  }

  /** @type {Headers} */
  const headers = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) {
      headers[key] = /** @type {string | string[] | number | null} */ (value)
    }
  }

  return headers
}

/**
 * @param {unknown} value
 * @returns {value is Headers}
 */
function isHeaders(value) {
  // Must be an object at the root level
  if (getConstructorName(value) !== 'Object') {
    return false
  }

  for (const headerValue of Object.values(/** @type {object} */ (value))) {
    const valueConstructorName = getConstructorName(headerValue)
    if (
      ['String', 'Number', 'Undefined', 'Null'].includes(
        valueConstructorName,
      )
    ) {
      continue
    }

    // `Array.isArray` To make TypeScript happy
    if (valueConstructorName !== 'Array' || !Array.isArray(headerValue)) {
      return false
    }

    // In case a value is an Array, all values inside it must be a string
    if (headerValue.every((arrValue) => getConstructorName(arrValue) === 'String')) {
      continue
    }

    return false
  }

  return true
}

/**
 * @param {unknown} value
 * @returns {Result<Headers>}
 */
function parseHeaders(value) {
  if (!isHeaders(value)) {
    return {
      ok: false,
      error: new TypeError('Expected a valid Headers object'),
    }
  }
  return { ok: true, value }
}

/**
 * RFC 9110 §7.6.1 — hop-by-hop headers that MUST NOT be forwarded by
 * an intermediary.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Removes hop-by-hop headers from a headers object.
 * Also removes any headers listed in the Connection header value
 * (RFC 9110 §7.6.1).
 *
 * @param {Headers} headers
 * @returns {Headers}
 */
function stripHopByHopHeaders(headers) {
  /** @type {Headers} */
  const output = {}

  // Parse Connection header to find additional headers to strip
  const connectionValue = headers['connection']
  /** @type {Set<string>} */
  const connectionTokens = new Set()
  if (typeof connectionValue === 'string') {
    for (const token of connectionValue.split(',')) {
      const trimmed = token.trim().toLowerCase()
      if (trimmed) {
        connectionTokens.add(trimmed)
      }
    }
  }

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lowerKey) || connectionTokens.has(lowerKey)) {
      continue
    }
    output[key] = value
  }

  return output
}

export {
  getBody,
  createRequest,
  getHeaders,
  redactHeaders,
  unredactHeaders,
  SecretNotFoundError,
  isHeaders,
  parseHeaders,
  stripHopByHopHeaders,
}
