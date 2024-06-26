/** @typedef {import('./index').Console} Console */

const Logger = require('.')

/** @type {Console} */
const consoleMock = {
  log() {},

  warn() {},

  error() {},
}

const logger = new Logger({ console: consoleMock })

describe('logger.prototype.log', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    Logger.level = 'silent'
    expect(logger.log('lorem ipsum')).toBe(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    Logger.level = 'verbose'
    expect(logger.log('lorem ipsum')).toBe(true)
  })

  it('doesnt log on level "error"', () => {
    expect.assertions(1)
    Logger.level = 'error'
    expect(logger.log('lorem ipsum')).toBe(false)
  })

  it('doesnt log on level "warn"', () => {
    expect.assertions(1)
    Logger.level = 'warn'
    expect(logger.log('lorem ipsum')).toBe(false)
  })
})

describe('logger.prototype.warn', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    Logger.level = 'silent'
    expect(logger.warn('lorem ipsum')).toBe(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    Logger.level = 'verbose'
    expect(logger.warn('lorem ipsum')).toBe(true)
  })

  it('doesnt log on level "error"', () => {
    expect.assertions(1)
    Logger.level = 'error'
    expect(logger.warn('lorem ipsum')).toBe(false)
  })

  it('does log on level "warn"', () => {
    expect.assertions(1)
    Logger.level = 'warn'
    expect(logger.warn('lorem ipsum')).toBe(true)
  })
})

describe('logger.prototype.error', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    Logger.level = 'silent'
    expect(logger.error('lorem ipsum')).toBe(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    Logger.level = 'verbose'
    expect(logger.error('lorem ipsum')).toBe(true)
  })

  it('does log on level "error"', () => {
    expect.assertions(1)
    Logger.level = 'error'
    expect(logger.error('lorem ipsum')).toBe(true)
  })

  it('does log on level "warn"', () => {
    expect.assertions(1)
    Logger.level = 'warn'
    expect(logger.error('lorem ipsum')).toBe(true)
  })
})
