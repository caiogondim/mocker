const { green, red, bold, yellow, stripMargin } = require('../format')

const prettyErrorSymbol = Symbol('pretty-error')

/**
 * @param {any} x
 * @returns {Boolean}
 */
function isPrettyError(x) {
  return typeof x === 'object' && Reflect.get(x, prettyErrorSymbol) === true
}

/**
 * @param {Object} options
 * @param {Error} options.error
 * @param {string} options.expected
 * @param {string} options.received
 * @param {string} [options.hint]
 * @returns {Error}
 */
function prettifyError({ error, expected, received, hint = '' }) {
  const prettyErrorMessage = (() => {
    let message = stripMargin(`${bold(error.constructor.name)}: ${error.message}
          |${green(`Expected`)} ${expected}
          |${red(`Received`)} ${received}`)

    if (hint) {
      message = `${message}\n${yellow('Hint')} ${hint}`
    }

    return message
  })()

  const proxy = new Proxy(error, {
    get(target, property) {
      if (property === 'message') {
        return prettyErrorMessage
      } else if (property === prettyErrorSymbol) {
        return true
      }

      return Reflect.get(target, property)
    },
  })

  return proxy
}

module.exports = { isPrettyError, prettifyError }
