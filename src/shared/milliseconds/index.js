/** @typedef {import('../types.js').Milliseconds} Milliseconds */

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * @param {string} input
 * @returns {import("../types.js").Result<Milliseconds>}
 */
function parse(input) {
  const n = Number.parseInt(input, 10)

  if (!Number.isInteger(n) || String(n) !== input || n < 0 || n > ONE_HOUR_MS) {
    return {
      ok: false,
      error: new TypeError(
        `Expected a non-negative integer between 0 and ${ONE_HOUR_MS} (one hour), got: "${input}"`,
      ),
    }
  }

  return { ok: true, value: /** @type {Milliseconds} */ (n) }
}

export { parse }
