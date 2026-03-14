/** @typedef {import('../types.js').NonNegativeInteger} NonNegativeInteger */

/**
 * @param {string} input
 * @returns {import("../types.js").Result<NonNegativeInteger>}
 */
function parse(input) {
  const n = Number.parseInt(input, 10)

  if (!Number.isInteger(n) || n < 0 || String(n) !== input) {
    return {
      ok: false,
      error: new TypeError(`Expected a non-negative integer, got: "${input}"`),
    }
  }

  return { ok: true, value: /** @type {NonNegativeInteger} */ (n) }
}

export { parse }
