/**
 * @param {string} str
 * @returns {Boolean}
 */
function stringToBoolean(str) {
  return (
    str === '1' || str === 'true' || str === 't' || str === 'yes' || str === 'y'
  )
}

module.exports = stringToBoolean
