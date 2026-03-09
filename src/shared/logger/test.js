import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

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
    setLevel('silent')
    assert.strictEqual(logger.log('lorem ipsum'), false)
  })

  it('does log on level "verbose"', () => {
    setLevel('verbose')
    assert.strictEqual(logger.log('lorem ipsum'), true)
  })

  it('doesnt log on level "error"', () => {
    setLevel('error')
    assert.strictEqual(logger.log('lorem ipsum'), false)
  })

  it('doesnt log on level "warn"', () => {
    setLevel('warn')
    assert.strictEqual(logger.log('lorem ipsum'), false)
  })
})

describe('logger.warn', () => {
  it('doesnt log on level "silent"', () => {
    setLevel('silent')
    assert.strictEqual(logger.warn('lorem ipsum'), false)
  })

  it('does log on level "verbose"', () => {
    setLevel('verbose')
    assert.strictEqual(logger.warn('lorem ipsum'), true)
  })

  it('doesnt log on level "error"', () => {
    setLevel('error')
    assert.strictEqual(logger.warn('lorem ipsum'), false)
  })

  it('does log on level "warn"', () => {
    setLevel('warn')
    assert.strictEqual(logger.warn('lorem ipsum'), true)
  })
})

describe('logger.error', () => {
  it('doesnt log on level "silent"', () => {
    setLevel('silent')
    assert.strictEqual(logger.error('lorem ipsum'), false)
  })

  it('does log on level "verbose"', () => {
    setLevel('verbose')
    assert.strictEqual(logger.error('lorem ipsum'), true)
  })

  it('does log on level "error"', () => {
    setLevel('error')
    assert.strictEqual(logger.error('lorem ipsum'), true)
  })

  it('does log on level "warn"', () => {
    setLevel('warn')
    assert.strictEqual(logger.error('lorem ipsum'), true)
  })
})
