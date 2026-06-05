import type { HttpStatusCode, Result } from '../types.js'

/**
 * Pre-validated HTTP status code constants.
 */
const HTTP_STATUS_CODE: Readonly<Record<string, HttpStatusCode>> = {
  OK: 200 as HttpStatusCode,
  CREATED: 201 as HttpStatusCode,
  NO_CONTENT: 204 as HttpStatusCode,
  NOT_MODIFIED: 304 as HttpStatusCode,
  BAD_REQUEST: 400 as HttpStatusCode,
  UNAUTHORIZED: 401 as HttpStatusCode,
  FORBIDDEN: 403 as HttpStatusCode,
  NOT_FOUND: 404 as HttpStatusCode,
  METHOD_NOT_ALLOWED: 405 as HttpStatusCode,
  INTERNAL_SERVER_ERROR: 500 as HttpStatusCode,
  BAD_GATEWAY: 502 as HttpStatusCode,
  SERVICE_UNAVAILABLE: 503 as HttpStatusCode,
}

function parse(input: number): Result<HttpStatusCode> {
  if (!Number.isInteger(input) || input < 100 || input > 599) {
    return {
      ok: false,
      error: new TypeError(
        `Expected an HTTP status code (100–599), got: ${input}`,
      ),
    }
  }

  return { ok: true, value: input as HttpStatusCode }
}

export { HTTP_STATUS_CODE, parse }
