/**
 * @param {any} val
 * @returns {Boolean}
 */
function isPrimitive(val) {
  if (typeof val === 'object') {
    return val === null
  }
  return typeof val !== 'function'
}

/**
 * @param {any} obj
 * @param {string[]} props
 * @returns {any}
 */
function safeGet(obj, props) {
  if (isPrimitive(obj) || props.length === 0) {
    return props.length ? undefined : obj
  }

  const deeperObj = obj[props[0]]
  const restProps = props.slice(1)

  return safeGet(deeperObj, restProps)
}

module.exports = safeGet
