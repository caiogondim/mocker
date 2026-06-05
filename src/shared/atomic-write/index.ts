import { randomUUID } from 'node:crypto'

import nativeFs from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from '../stream/index.js'
import type { FsLike, Result } from '../types.js'

async function atomicWrite({
  filePath,
  content,
  fs = nativeFs,
}: {
  filePath: string
  content: string
  fs?: FsLike
}): Promise<Result<void>> {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  const {
    createWriteStream,
    promises: { rename, unlink },
  } = fs

  try {
    await pipeline(
      Readable.from(content),
      createWriteStream(tmpPath, { autoClose: true }),
    )
    await rename(tmpPath, filePath)
    return { ok: true, value: undefined }
  } catch (error) {
    try {
      await unlink(tmpPath)
    } catch {
      // Best-effort cleanup; ignore errors
    }
    return { ok: false, error: error as Error }
  }
}

export default atomicWrite
