import type { Result } from '../types.js'

/** Coerce an unknown thrown value into an Error. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function tryCatch<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return { ok: false, error: toError(error) }
  }
}

async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return { ok: false, error: toError(error) }
  }
}

export { toError, tryCatch, tryCatchAsync }
