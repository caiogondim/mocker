function getConstructorName(x: unknown): string {
  return Object.prototype.toString.call(x).slice(8, -1)
}

export default getConstructorName
