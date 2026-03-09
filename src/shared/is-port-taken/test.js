import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import getPort from '../../__tests__/helpers/get-port.js'
import { createServer as createMathServer } from '../../../tools/math-server/index.js'
import isPortTaken from './index.js'

describe('isPortTaken', () => {
  it('returns `true` if a port was taken', async () => {
    const mathServer = createMathServer()

    try {
      const port = await getPort()
      await mathServer.listen(port)

      assert.strictEqual(await isPortTaken(port), true)
    } finally {
      await mathServer.close()
    }
  })

  it('returns `false` if a port is available', async () => {
    const port = await getPort()
    assert.strictEqual(await isPortTaken(port), false)
  })

  // Regression test. There was a bug when running `isPortTaken` inside a loop
  // since the server created to listen to a port was not being destroyed
  // properly
  it('returns `false` correctly if inside a loop', async () => {
    const port = await getPort()
    for (let i = 0; i < 100; i += 1) {
      assert.strictEqual(await isPortTaken(port), false)
    }
  })

  // Regression test. There was a bug when running `isPortTaken` inside a loop
  // since the server created to listen to a port was not being destroyed
  // properly
  it('returns `true` correctly if inside a loop', async () => {
    const mathServer = createMathServer()

    try {
      const port = await getPort()
      await mathServer.listen(port)

      for (let i = 0; i < 100; i += 1) {
        assert.strictEqual(await isPortTaken(port), true)
      }
    } finally {
      await mathServer.close()
    }
  })
})
