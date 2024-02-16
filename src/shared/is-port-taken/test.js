const getPort = require('get-port')
const { createServer: createMathServer } = require('../../../tools/math-server')
const isPortTaken = require('.')

describe('isPortTaken', () => {
  it('returns `true` if a port was taken', async () => {
    expect.assertions(1)

    const mathServer = createMathServer()

    try {
      const port = await getPort()
      await mathServer.listen(port)

      expect(await isPortTaken(port)).toStrictEqual(true)
    } finally {
      await mathServer.close()
    }
  })

  it('returns `false` if a port is available', async () => {
    expect.assertions(1)
    const port = await getPort()
    expect(await isPortTaken(port)).toStrictEqual(false)
  })

  // Regression test. There was a bug when running `isPortTaken` inside a loop
  // since the server created to listen to a port was not being destroyed
  // properly
  it('returns `false` correctly if inside a loop', async () => {
    expect.assertions(100)
    const port = await getPort()
    for (let i = 0; i < 100; i += 1) {
      expect(await isPortTaken(port)).toStrictEqual(false)
    }
  })

  // Regression test. There was a bug when running `isPortTaken` inside a loop
  // since the server created to listen to a port was not being destroyed
  // properly
  it('returns `true` correctly if inside a loop', async () => {
    expect.assertions(100)

    const mathServer = createMathServer()

    try {
      const port = await getPort()
      await mathServer.listen(port)

      for (let i = 0; i < 100; i += 1) {
        expect(await isPortTaken(port)).toStrictEqual(true)
      }
    } finally {
      await mathServer.close()
    }
  })
})
