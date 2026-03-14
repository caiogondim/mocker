/**
 * @param {unknown} x
 * @returns {string}
 */
function getConstructorName(x) {
  return Object.prototype.toString.call(x).slice(8, -1)
}

export default getConstructorName
