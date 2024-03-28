/** @typedef {import('../types').Headers} Headers */

const clone = require('../../clone')

class SecretNotFoundError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'SecretNotFoundError'
  }
}

/**
 * @param {Headers} headers
 * @param {Headers} redactedHeaders
 * @returns {Headers}
 */
function redactHeaders(headers, redactedHeaders) {
  const headersClone = clone(headers)

  for (const key of Object.keys(redactedHeaders)) {
    if (key in headers) {
      headersClone[key] = `[REDACTED]`
    }
  }

  return headersClone
}

/**
 * @param {Headers} headers
 * @param {Headers} redactedHeaders
 * @returns {Headers}
 */
function unredactHeaders(headers, redactedHeaders) {
  const headersClone = clone(headers)

  for (const [key, value] of Object.entries(headersClone)) {
    if (value !== '[REDACTED]') continue

    if (!(key in redactedHeaders)) {
      throw new SecretNotFoundError(`missing key \`${key}\` in redactedHeaders`)
    }

    headersClone[key] = redactedHeaders[key]
  }

  return headersClone
}

module.exports = {
  redactHeaders,
  unredactHeaders,
  SecretNotFoundError,
}
