function createBackoff({
  max = 30000,
  initial = 1000,
}: {
  max?: number
  initial?: number
} = {}): () => Promise<void> {
  let cur = initial
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, cur))
    cur = Math.min(cur * 2, max)
  }
}

export default createBackoff
