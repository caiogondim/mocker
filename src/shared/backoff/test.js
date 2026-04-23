import { describe, it, expect, jest } from '@jest/globals'
import createBackoff from './index.js'

jest.useFakeTimers()
jest.spyOn(global, 'setTimeout')

describe('backoff', () => {
  it('increments the previous back off time by multiplying by 2', async () => {
    const backoff = createBackoff()

    await Promise.all([backoff(), jest.advanceTimersByTime(1000)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000)

    await Promise.all([backoff(), jest.advanceTimersByTime(2000)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000)

    await Promise.all([backoff(), jest.advanceTimersByTime(4000)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 4000)
  })

  it('never backs off for more than `max` ms', async () => {
    const backoff = createBackoff({ max: 2000 })

    await Promise.all([backoff(), jest.advanceTimersByTime(1000)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000)

    await Promise.all([backoff(), jest.advanceTimersByTime(2000)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000)

    await Promise.all([backoff(), jest.advanceTimersByTime(2000)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000)

    await Promise.all([backoff(), jest.advanceTimersByTime(2000)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000)
  })

  it('accepts `initial` as the initial back off time', async () => {
    const backoff = createBackoff({ initial: 200 })

    await Promise.all([backoff(), jest.advanceTimersByTime(200)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 200)

    await Promise.all([backoff(), jest.advanceTimersByTime(400)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 400)

    await Promise.all([backoff(), jest.advanceTimersByTime(800)])
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 800)
  })
})
