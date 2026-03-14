class MockFileError extends Error {
  /**
   * @param {Error} cause
   * @param {string} mockPath
   */
  constructor(cause, mockPath) {
    super(cause.message, { cause })
    this.name = 'MockFileError'
    this.mockPath = mockPath
  }
}

export { MockFileError }
