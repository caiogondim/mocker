const { green, red, bold, yellow, stripMargin } = require('../format')

const prettyErrorSymbol = Symbol('pretty-error')

/**
 * @param {any} x
 * @returns {Boolean}
 */
function isPrettyError(x) {
  const objectPropertySymbols = Object.getOwnPropertySymbols(x)
  return objectPropertySymbols.includes(prettyErrorSymbol)
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

  // Creating a proxy so the original object is not modified
  const proxy = Object.defineProperty(new Proxy(error, {}), 'message', {
    value: prettyErrorMessage,
  })

  // Attaching a `prettyErrorSymbol` property to flag this is a "pretty error"
  // object.
  proxy[prettyErrorSymbol] = true

  return proxy
}

module.exports = { isPrettyError, prettifyError }
