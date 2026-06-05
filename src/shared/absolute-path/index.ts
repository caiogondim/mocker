import type { AbsolutePath, Result } from '../types.js'

/**
 * Parse a string into an absolute URL path (must start with `/`). Unlike
 * AbsoluteDirPath this does no filesystem check — it brands a request-target
 * path used for `--rewritePath` rules.
 */
function parse(input: string): Result<AbsolutePath> {
  if (!input.startsWith('/')) {
    return {
      ok: false,
      error: new TypeError(`Expected an absolute path, got: "${input}"`),
    }
  }

  return {
    ok: true,
    value: input as AbsolutePath,
  }
}

export { parse }
