import type { HttpMethod, Result } from '../types.js'

const HTTP_METHOD = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
} as const satisfies Record<string, HttpMethod>

const VALID_METHODS: ReadonlySet<string> = new Set(Object.values(HTTP_METHOD))

function parse(input: string | undefined): Result<HttpMethod> {
  if (!input || !VALID_METHODS.has(input)) {
    return {
      ok: false,
      error: new TypeError(`Expected a valid HTTP method, got: "${input}"`),
    }
  }

  return { ok: true, value: input as HttpMethod }
}

export { HTTP_METHOD, parse }
