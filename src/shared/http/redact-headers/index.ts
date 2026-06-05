import type { Result } from '../../types.js'
import type { Headers } from '../types.js'

class SecretNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretNotFoundError'
  }
}

function redactHeaders(headers: Headers, redactedHeaders: Headers): Headers {
  const headersClone = structuredClone(headers)

  for (const key of Object.keys(redactedHeaders)) {
    if (key in headers) {
      headersClone[key] = `[REDACTED]`
    }
  }

  return headersClone
}

function unredactHeaders(
  headers: Headers,
  redactedHeaders: Headers,
): Result<Headers, SecretNotFoundError> {
  const headersClone = structuredClone(headers)

  for (const [key, value] of Object.entries(headersClone)) {
    if (value !== '[REDACTED]') continue

    if (!(key in redactedHeaders)) {
      return {
        ok: false,
        error: new SecretNotFoundError(
          `missing key \`${key}\` in redactedHeaders`,
        ),
      }
    }

    headersClone[key] = redactedHeaders[key]
  }

  return { ok: true, value: headersClone }
}

export { redactHeaders, SecretNotFoundError, unredactHeaders }
