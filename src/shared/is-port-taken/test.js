import { describe, it, expect } from '@jest/globals'
import getPort from '../../__tests__/helpers/get-port.js'
import { createServer as createMathServer } from '../../../tools/math-server/index.js'
import isPortTaken from './index.js'

describe('isPortTaken', () => {
  it('returns `true` if a port was taken', async () => {
    await using mathServer = createMathServer()
    const port = await getPort()
    await mathServer.listen(port)

    expect(await isPortTaken(port)).toBe(true)
  })

  it('returns `false` if a port is available', async () => {
    const port = await getPort()
    expect(await isPortTaken(port)).toBe(false)
  })

  // Regression test. There was a bug when running `isPortTaken` inside a loop
  // since the server created to listen to a port was not being destroyed
  // properly
  it('returns `false` correctly if inside a loop', async () => {
    const port = await getPort()
    for (let i = 0; i < 100; i += 1) {
      expect(await isPortTaken(port)).toBe(false)
    }
  })

  // Regression test. There was a bug when running `isPortTaken` inside a loop
  // since the server created to listen to a port was not being destroyed
  // properly
  it('returns `true` correctly if inside a loop', async () => {
    await using mathServer = createMathServer()
    const port = await getPort()
    await mathServer.listen(port)

    for (let i = 0; i < 100; i += 1) {
      expect(await isPortTaken(port)).toBe(true)
    }
  })
})
