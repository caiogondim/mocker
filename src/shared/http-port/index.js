/** @typedef {import('../types.js').HttpPort} HttpPort */

/**
 * @param {string} input
 * @returns {import("../types.js").Result<HttpPort>}
 */
function parse(input) {
  const n = Number.parseInt(input, 10)

  if (!Number.isInteger(n) || n < 0 || n > 65535 || String(n) !== input) {
    return {
      ok: false,
      error: new TypeError(
        `Expected a valid HTTP port (0–65535), got: "${input}"`,
      ),
    }
  }

  return { ok: true, value: /** @type {HttpPort} */ (n) }
}

export { parse }
