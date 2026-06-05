import type { NonNegativeInteger, Result } from '../types.js'

function parse(input: string): Result<NonNegativeInteger> {
  const n = Number.parseInt(input, 10)

  if (!Number.isInteger(n) || n < 0 || String(n) !== input) {
    return {
      ok: false,
      error: new TypeError(`Expected a non-negative integer, got: "${input}"`),
    }
  }

  return { ok: true, value: n as NonNegativeInteger }
}

export { parse }
