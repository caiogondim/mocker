/**
 * @param {string} str
 * @returns {boolean}
 */
function stringToBoolean(str) {
  return (
    str === '1' || str === 'true' || str === 't' || str === 'yes' || str === 'y'
  )
}

export default stringToBoolean
