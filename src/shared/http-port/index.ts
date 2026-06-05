import type { HttpPort, Result } from '../types.js'

function parse(input: string): Result<HttpPort> {
  const n = Number.parseInt(input, 10)

  if (!Number.isInteger(n) || n < 0 || n > 65535 || String(n) !== input) {
    return {
      ok: false,
      error: new TypeError(
        `Expected a valid HTTP port (0–65535), got: "${input}"`,
      ),
    }
  }

  return { ok: true, value: n as HttpPort }
}

export { parse }
