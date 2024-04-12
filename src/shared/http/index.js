/** @typedef {import('stream').Readable} Readable */
/** @typedef {import('./types').Stream} Stream */
/** @typedef {import('./types').RequestWrite} RequestWrite */
/** @typedef {import('../../mock-manager/mocked-request')} MockedRequest */
/** @typedef {import('../../mock-manager/mocked-response')} MockedResponse */
/** @typedef {import('../types').HttpIncomingMessage} HttpIncomingMessage */
/** @typedef {import('../types').HttpServerResponse} HttpServerResponse */
/** @typedef {import('./types').Headers} Headers */

const getConstructorName = require('../get-constructor-name')
const createRequest = require('./request')
const {
  redactHeaders,
  unredactHeaders,
  SecretNotFoundError,
} = require('./redact-headers')
const values = require('../stream/values')

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
    return global.structuredClone(reqOrRes.headers)
  }

  if ('getHeaders' in reqOrRes && typeof reqOrRes.getHeaders === 'function') {
    return global.structuredClone(reqOrRes.getHeaders())
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

module.exports = {
  getBody,
  createRequest,
  getHeaders,
  redactHeaders,
  unredactHeaders,
  SecretNotFoundError,
  isHeaders,
}
