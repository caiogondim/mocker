import path from 'node:path'
import { Writable } from 'node:stream'
import type { FsLike } from '../types.js'

/**
 * Minimal in-memory filesystem fake used in tests, replacing `memfs`. Backs
 * onto a `Map` of file contents plus a set of known directories. Implements
 * only the surface the code uses (the `FsLike` contract), including the
 * behavior `atomic-write` relies on: writing into a missing directory fails
 * with an ENOENT-coded error.
 */
function createMemoryFs(): FsLike {
  /** Absolute file path -> contents. */
  const files = new Map<string, Buffer>()
  /** Known directories. Root always exists. */
  const dirs = new Set<string>(['/'])

  function enoent(syscall: string, target: string): NodeJS.ErrnoException {
    const error = new Error(
      `ENOENT: no such file or directory, ${syscall} '${target}'`,
    ) as NodeJS.ErrnoException
    error.code = 'ENOENT'
    return error
  }

  // Directories are stored without a trailing slash so existence checks are a
  // single, exact lookup.
  function normalizeDir(dir: string): string {
    return dir.replace(/\/+$/, '') || '/'
  }

  function dirExists(dir: string): boolean {
    return dirs.has(normalizeDir(dir))
  }

  const promises: FsLike['promises'] = {
    async mkdir(dirPath) {
      dirs.add(normalizeDir(String(dirPath)))
      return undefined
    },

    async readFile(filePath, options) {
      const key = String(filePath)
      const buffer = files.get(key)
      if (!buffer) {
        throw enoent('open', key)
      }
      const encoding = typeof options === 'string' ? options : options?.encoding
      return encoding ? buffer.toString(encoding) : buffer
    },

    async readdir(dirPath) {
      const dir = String(dirPath).replace(/\/$/, '') || '/'
      const names: string[] = []
      for (const filePath of files.keys()) {
        if (path.dirname(filePath) === dir) {
          names.push(path.basename(filePath))
        }
      }
      return names
    },

    async unlink(filePath) {
      const key = String(filePath)
      if (!files.has(key)) {
        throw enoent('unlink', key)
      }
      files.delete(key)
    },

    async rename(from, to) {
      const fromKey = String(from)
      const toKey = String(to)
      const buffer = files.get(fromKey)
      if (!buffer) {
        throw enoent('rename', fromKey)
      }
      if (!dirExists(path.dirname(toKey))) {
        throw enoent('rename', toKey)
      }
      files.delete(fromKey)
      files.set(toKey, buffer)
    },

    async stat(filePath) {
      const key = String(filePath)
      const isFile = files.has(key)
      const isDir = dirExists(key)
      if (!isFile && !isDir) {
        throw enoent('stat', key)
      }
      return {
        isFile: () => isFile,
        isDirectory: () => isDir,
      } as Awaited<ReturnType<FsLike['promises']['stat']>>
    },
  } as FsLike['promises']

  const createWriteStream: FsLike['createWriteStream'] = (filePath) => {
    const key = String(filePath)
    const chunks: Buffer[] = []
    const parentMissing = !dirExists(path.dirname(key))

    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
      final(callback) {
        if (parentMissing) {
          // Writing into a missing directory fails, matching real fs (the
          // ENOENT surfaces as the stream's 'error', rejecting the pipeline).
          callback(enoent('open', key))
          return
        }
        files.set(key, Buffer.concat(chunks))
        callback()
      },
    })

    return stream as ReturnType<FsLike['createWriteStream']>
  }

  return { promises, createWriteStream }
}

export { createMemoryFs }
