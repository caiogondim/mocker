/** @typedef {import('./types').Clone} Clone */

// @TODO: replace this with `structuredClone`

/** @type {Clone} */
function clone(source) {
  return JSON.parse(JSON.stringify(source))
}

module.exports = clone
