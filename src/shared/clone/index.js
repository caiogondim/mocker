/** @typedef {import('./types').Clone} Clone */

/** @type {Clone} */
function clone(source) {
  if (source === undefined) {
    return undefined
  }
  return JSON.parse(JSON.stringify(source))
}

module.exports = clone
