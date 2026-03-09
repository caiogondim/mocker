import { describe, it, expect } from 'vitest'

/** @typedef {import('./index.js').Console} Console */

import createLogger, { setLevel } from './index.js'

/** @type {Console} */
const consoleMock = {
  log() {},

  warn() {},

  error() {},
}

const logger = createLogger({ console: consoleMock })

describe('logger.log', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    setLevel('silent')
    expect(logger.log('lorem ipsum')).toBe(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    setLevel('verbose')
    expect(logger.log('lorem ipsum')).toBe(true)
  })

  it('doesnt log on level "error"', () => {
    expect.assertions(1)
    setLevel('error')
    expect(logger.log('lorem ipsum')).toBe(false)
  })

  it('doesnt log on level "warn"', () => {
    expect.assertions(1)
    setLevel('warn')
    expect(logger.log('lorem ipsum')).toBe(false)
  })
})

describe('logger.warn', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    setLevel('silent')
    expect(logger.warn('lorem ipsum')).toBe(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    setLevel('verbose')
    expect(logger.warn('lorem ipsum')).toBe(true)
  })

  it('doesnt log on level "error"', () => {
    expect.assertions(1)
    setLevel('error')
    expect(logger.warn('lorem ipsum')).toBe(false)
  })

  it('does log on level "warn"', () => {
    expect.assertions(1)
    setLevel('warn')
    expect(logger.warn('lorem ipsum')).toBe(true)
  })
})

describe('logger.error', () => {
  it('doesnt log on level "silent"', () => {
    expect.assertions(1)
    setLevel('silent')
    expect(logger.error('lorem ipsum')).toBe(false)
  })

  it('does log on level "verbose"', () => {
    expect.assertions(1)
    setLevel('verbose')
    expect(logger.error('lorem ipsum')).toBe(true)
  })

  it('does log on level "error"', () => {
    expect.assertions(1)
    setLevel('error')
    expect(logger.error('lorem ipsum')).toBe(true)
  })

  it('does log on level "warn"', () => {
    expect.assertions(1)
    setLevel('warn')
    expect(logger.error('lorem ipsum')).toBe(true)
  })
})
