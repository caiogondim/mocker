class MockFileError extends Error {
  mockPath: string

  constructor(cause: Error, mockPath: string) {
    super(cause.message, { cause })
    this.name = 'MockFileError'
    this.mockPath = mockPath
  }
}

export { MockFileError }
