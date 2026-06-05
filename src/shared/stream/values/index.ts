async function values<T>(stream: AsyncIterable<T> | Iterable<T>): Promise<T[]> {
  const chunks: T[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

export default values
