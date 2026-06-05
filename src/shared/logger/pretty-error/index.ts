import { bold, green, red, stripMargin, yellow } from '../format/index.js'

const prettyErrorSymbol = Symbol('pretty-error')

function isPrettyError(x: unknown): boolean {
  return (
    typeof x === 'object' &&
    x !== null &&
    Reflect.get(x, prettyErrorSymbol) === true
  )
}

function prettifyError({
  error,
  expected,
  received,
  hint = '',
}: {
  error: Error
  expected: string
  received: string
  hint?: string
}): Error {
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

export { isPrettyError, prettifyError }
