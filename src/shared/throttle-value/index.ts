import type { Result, ThrottleValue } from '../types.js'

function parse(input: string): Result<ThrottleValue> {
  if (input === 'Infinity') {
    return { ok: true, value: Infinity as ThrottleValue }
  }

  const value = Number.parseInt(input, 10)

  if (!Number.isInteger(value) || value <= 0 || String(value) !== input) {
    return {
      ok: false,
      error: new TypeError(
        `Expected a positive integer or "Infinity", got: "${input}"`,
      ),
    }
  }

  return { ok: true, value: value as ThrottleValue }
}

export { parse }
