/** @typedef {import('node:stream').Readable} Readable */
/** @typedef {import('./types.js').Stream} Stream */
/** @typedef {import('./types.js').RequestWrite} RequestWrite */
/** @typedef {InstanceType<import('../../mock-manager/mocked-request.js')["default"]>} MockedRequest */
/** @typedef {InstanceType<import('../../mock-manager/mocked-response.js')["default"]>} MockedResponse */
/** @typedef {import('../types.js').HttpIncomingMessage} HttpIncomingMessage */
/** @typedef {import('../types.js').HttpServerResponse} HttpServerResponse */
/** @typedef {import('./types.js').Headers} Headers */

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
  if ('headers' in reqOrRes) {
    return structuredClone(reqOrRes.headers)
  }

  if ('getHeaders' in reqOrRes && typeof reqOrRes.getHeaders === 'function') {
    return structuredClone(reqOrRes.getHeaders())
  }

  return {}
}

/**
 * @param {any} x
 * @returns {x is Headers}
 */
function isHeaders(x) {
  // Must be an object at the root level
  if (getConstructorName(x) !== 'Object') {
    return false
  }

  for (const value of Object.values(x)) {
    const valueConstructorName = getConstructorName(value)
    if (
      ['String', 'Number', 'Undefined', 'Null', 'Boolean'].includes(
        valueConstructorName
      )
    ) {
      continue
    }

    // `Array.isArray` To make TypeScript happy
    if (valueConstructorName !== 'Array' || !Array.isArray(value)) {
      return false
    }

    // In case a value is an Array, all values inside it must be a string
    if (value.every((arrValue) => getConstructorName(arrValue) === 'String')) {
      continue
    }

    return false
  }

  return true
}

export {
  getBody,
  createRequest,
  getHeaders,
  redactHeaders,
  unredactHeaders,
  SecretNotFoundError,
  isHeaders,
}
