import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import createBackoff from './index.js'

mock.timers.enable()
const setTimeoutSpy = mock.method(global, 'setTimeout', global.setTimeout)

describe('backoff', () => {
  it('increments the previous back off time by multiplying by 2', async () => {
    const backoff = createBackoff()

    await Promise.all([backoff(), mock.timers.tick(1000)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 1000)

    await Promise.all([backoff(), mock.timers.tick(2000)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 2000)

    await Promise.all([backoff(), mock.timers.tick(4000)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 4000)
  })

  it('never backs off for more than `max` ms', async () => {
    const backoff = createBackoff({ max: 2000 })

    // First backoff call should sleep for 1000
    await Promise.all([backoff(), mock.timers.tick(1000)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 1000)

    // Second backoff call should sleep for 2000
    await Promise.all([backoff(), mock.timers.tick(2000)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 2000)

    // Third backoff call should sleep for 2000, since `max` is 2000
    await Promise.all([backoff(), mock.timers.tick(2000)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 2000)

    // Fourth backoff call should sleep for 2000, since `max` is 2000
    await Promise.all([backoff(), mock.timers.tick(2000)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 2000)
  })

  it('accepts `initial` as the initial back off time', async () => {
    const backoff = createBackoff({ initial: 200 })

    await Promise.all([backoff(), mock.timers.tick(200)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 200)

    await Promise.all([backoff(), mock.timers.tick(400)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 400)

    await Promise.all([backoff(), mock.timers.tick(800)])
    assert.strictEqual(setTimeoutSpy.mock.calls.at(-1).arguments[1], 800)
  })
})
