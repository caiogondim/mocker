/**
 * Tried and true way for getting a constructor's name of any reference.
 *
 * @param {any} x
 * @returns {string}
 */
function getConstructorName(x) {
  return Object.prototype.toString.call(x).slice(8, -1)
}

module.exports = getConstructorName
