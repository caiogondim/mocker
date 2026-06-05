import { PassThrough, Transform } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { toError } from '../../try-catch/index.js'

function delay({ ms }: { ms: number }): Transform {
  if (ms === 0) {
    return new PassThrough()
  }

  let isFirstChunk = true
  const ac = new AbortController()
  const stream = new Transform({
    async transform(chunk, _encoding, callback) {
      try {
        if (isFirstChunk) {
          await sleep(ms, undefined, { signal: ac.signal })
          isFirstChunk = false
        }
        return callback(null, chunk)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return callback()
        }
        return callback(toError(error))
      }
    },
    flush(callback) {
      isFirstChunk = true
      callback()
    },
    destroy(error, callback) {
      ac.abort()
      callback(error)
    },
  })
  return stream
}

export default delay
