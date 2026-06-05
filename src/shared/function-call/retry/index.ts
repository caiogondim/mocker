import createBackoff from '../../backoff/index.js'
import type { Result } from '../../types.js'

async function attempt<T>(
  asyncThunk: () => Promise<T>,
  shouldRetry: (value: T) => boolean,
  onRetry: () => void,
): Promise<{ done: true; value: T } | { done: false }> {
  const value = await asyncThunk()
  if (!shouldRetry(value)) {
    return { done: true, value }
  }
  onRetry()
  return { done: false }
}

async function retry<T>(
  asyncThunk: () => Promise<T>,
  {
    retries = 3,
    shouldRetry = () => false,
    onRetry = () => {},
    backoff = createBackoff(),
  }: {
    retries?: number
    shouldRetry?: (value: T) => boolean
    onRetry?: () => void
    backoff?: () => Promise<void>
  } = {},
): Promise<Result<T>> {
  for (let attempts = 0; attempts < retries; attempts += 1) {
    try {
      const result = await attempt(asyncThunk, shouldRetry, onRetry)
      if (result.done) return { ok: true, value: result.value as T }
    } catch (error) {
      if (attempts === retries - 1) return { ok: false, error: error as Error }
      onRetry()
    }
    await backoff()
  }

  return {
    ok: false,
    error: new Error(
      'retry exhausted all attempts without a successful response',
    ),
  }
}

export default retry
