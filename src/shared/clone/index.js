/** @typedef {import('./types').Clone} Clone */

/** @type {Clone} */
function clone(source) {
  return JSON.parse(JSON.stringify(source))
}

module.exports = clone
