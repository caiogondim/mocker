/** @typedef {import('../types.js').Headers} Headers */
/** @template T @template {Error} [E=Error] @typedef {import('../../types.js').Result<T, E>} Result */

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
  const headersClone = structuredClone(headers)

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
 * @returns {Result<Headers, SecretNotFoundError>}
 */
function unredactHeaders(headers, redactedHeaders) {
  const headersClone = structuredClone(headers)

  for (const [key, value] of Object.entries(headersClone)) {
    if (value !== '[REDACTED]') continue

    if (!(key in redactedHeaders)) {
      return { ok: false, error: new SecretNotFoundError(`missing key \`${key}\` in redactedHeaders`) }
    }

    headersClone[key] = redactedHeaders[key]
  }

  return { ok: true, value: headersClone }
}

export { redactHeaders, unredactHeaders, SecretNotFoundError }
