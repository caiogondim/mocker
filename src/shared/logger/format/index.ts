import { styleText } from 'node:util'
import type { Json } from '../../types.js'

function bold(str: unknown): string {
  return styleText('bold', String(str))
}

function red(str: unknown): string {
  return styleText('red', String(str))
}

function blue(str: unknown): string {
  return styleText('blue', String(str))
}

function yellow(str: unknown): string {
  return styleText('yellow', String(str))
}

function green(str: unknown): string {
  return styleText('green', String(str))
}

function dim(str: unknown): string {
  return styleText('dim', String(str))
}

function stripMargin(str: string, marginChar = '|'): string {
  const regexp = new RegExp(`[\\s]+\\${marginChar}`, `g`)
  const output = []
  for (const line of str.split('\n')) {
    output.push(line.replace(regexp, ''))
  }
  return output.join('\n')
}

// Matches ANSI terminal escape codes (e.g. ESC[32m for green text). The ESC
// byte (0x1b) is built via `String.fromCharCode` so the regex source contains
// no literal control character (which the linter forbids).
const ANSI_ESCAPE_CODE_REGEX = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9]+m`,
  'g',
)

function table(...data: string[][]): string {
  const maxWidths: number[] = []
  const lines = []

  for (const dataLine of data) {
    for (const [i, datum] of dataLine.entries()) {
      const datumWithoutFormattingCode = datum.replace(
        ANSI_ESCAPE_CODE_REGEX,
        '',
      )
      maxWidths[i] = Math.max(
        maxWidths[i] || 0,
        datumWithoutFormattingCode.length,
      )
    }
  }

  for (const dataLine of data) {
    const lineEntries = []
    for (const [i, datum] of dataLine.entries()) {
      const datumWithoutFormattingCode = datum.replace(
        ANSI_ESCAPE_CODE_REGEX,
        '',
      )
      const endPadding = datumWithoutFormattingCode
        .padEnd(maxWidths[i], ' ')
        .replace(datumWithoutFormattingCode, '')
      lineEntries.push(`${datum}${endPadding}`)
    }
    lines.push(lineEntries.join('  '))
  }

  return lines.join('\n')
}

function stringify(x: unknown): string {
  if (x === undefined) {
    return ''
  }

  function addSpaceBetweenArrayElements(x: string) {
    return x.replaceAll(`","`, `", "`)
  }

  function mapToJsonStringifiableType(x: unknown): Json {
    // From `Set` to `Array` since `JSON.stringify` outputs an empty object for
    // a `Set`.
    if (x && x?.constructor === Set) {
      return Array.from(x as Set<Json>)
    }
    return x as Json
  }

  return addSpaceBetweenArrayElements(
    JSON.stringify(mapToJsonStringifiableType(x)),
  )
}

export { blue, bold, dim, green, red, stringify, stripMargin, table, yellow }
