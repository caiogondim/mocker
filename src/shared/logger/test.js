const Logger = require('.')

const consoleMock = {
  /**
   * @param {...any} args
   * @returns {void}
   */
  log(...args) {}, // eslint-disable-line no-unused-vars

  /**
   * @param {...any} args
   * @returns {void}
   */
  warn(...args) {}, // eslint-disable-line no-unused-vars

  /**
   * @param {...any} args
   * @returns {void}
   */
  error(...args) {}, // eslint-disable-line no-unused-vars
}

const logger = new Logger({ console: consoleMock })

describe('logger.prototype.log', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    Logger.level = 'silent'
    expect(logger.log('lorem ipsum')).toStrictEqual(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    Logger.level = 'verbose'
    expect(logger.log('lorem ipsum')).toStrictEqual(true)
  })

  it('doesnt log on level "error"', () => {
    expect.assertions(1)
    Logger.level = 'error'
    expect(logger.log('lorem ipsum')).toStrictEqual(false)
  })

  it('doesnt log on level "warn"', () => {
    expect.assertions(1)
    Logger.level = 'warn'
    expect(logger.log('lorem ipsum')).toStrictEqual(false)
  })
})

describe('logger.prototype.warn', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    Logger.level = 'silent'
    expect(logger.warn('lorem ipsum')).toStrictEqual(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    Logger.level = 'verbose'
    expect(logger.warn('lorem ipsum')).toStrictEqual(true)
  })

  it('doesnt log on level "error"', () => {
    expect.assertions(1)
    Logger.level = 'error'
    expect(logger.warn('lorem ipsum')).toStrictEqual(false)
  })

  it('does log on level "warn"', () => {
    expect.assertions(1)
    Logger.level = 'warn'
    expect(logger.warn('lorem ipsum')).toStrictEqual(true)
  })
})

describe('logger.prototype.error', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    Logger.level = 'silent'
    expect(logger.error('lorem ipsum')).toStrictEqual(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    Logger.level = 'verbose'
    expect(logger.error('lorem ipsum')).toStrictEqual(true)
  })

  it('does log on level "error"', () => {
    expect.assertions(1)
    Logger.level = 'error'
    expect(logger.error('lorem ipsum')).toStrictEqual(true)
  })

  it('does log on level "warn"', () => {
    expect.assertions(1)
    Logger.level = 'warn'
    expect(logger.error('lorem ipsum')).toStrictEqual(true)
  })
})
