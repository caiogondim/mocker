/** @typedef {import('../types.js').ThrottleValue} ThrottleValue */

/**
 * @param {string} input
 * @returns {import("../types.js").Result<ThrottleValue>}
 */
function parse(input) {
  if (input === 'Infinity') {
    return { ok: true, value: /** @type {ThrottleValue} */ (Infinity) }
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

  return { ok: true, value: /** @type {ThrottleValue} */ (value) }
}

export { parse }
