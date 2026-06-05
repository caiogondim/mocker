import { tryCatch } from '../try-catch/index.js'
import type { HttpUrl, Result } from '../types.js'

function isHttpUrl(input: string): boolean {
  const result = tryCatch(() => new URL(input))
  return (
    result.ok &&
    (result.value.protocol === 'http:' || result.value.protocol === 'https:')
  )
}

function parse(input: string): Result<HttpUrl> {
  if (!isHttpUrl(input)) {
    return {
      ok: false,
      error: new TypeError(`Expected an HTTP or HTTPS URL, got: "${input}"`),
    }
  }

  return { ok: true, value: input as HttpUrl }
}

export { isHttpUrl, parse }
