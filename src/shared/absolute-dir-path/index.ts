import { promises as fs } from 'node:fs'

import path from 'node:path'
import { tryCatchAsync } from '../try-catch/index.js'
import type { AbsoluteDirPath, Result } from '../types.js'

async function parse(input: string): Promise<Result<AbsoluteDirPath>> {
  if (input === '') {
    return {
      ok: false,
      error: new TypeError(`Expected a valid directory path, got: "${input}"`),
    }
  }

  const result = await tryCatchAsync(() => fs.stat(input))

  if (!result.ok || !result.value.isDirectory()) {
    return {
      ok: false,
      error: new TypeError(
        `Expected an accessible directory path, got: "${input}"`,
      ),
    }
  }

  return {
    ok: true,
    value: path.resolve(input) as AbsoluteDirPath,
  }
}

export { parse }
