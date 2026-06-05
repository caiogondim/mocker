import { describe, expect, it } from 'bun:test'
import net from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import getPort from './__tests__/helpers/get-port.js'
import { parseArgv } from './args/index.js'
import Mocker from './index.js'
import { createMemoryFs } from './shared/__fixtures__/memory-fs.js'
import type { HttpPort } from './shared/types.js'

describe('Mocker', () => {
  it('closes within 3 seconds even with a stuck connection', async () => {
    const fs = createMemoryFs()
    const port = await getPort()
    const argsResult = await parseArgv([
      'node',
      'mocker',
      '--origin',
      'http://127.0.0.1:65535',
      '--port',
      String(port),
      '--mode',
      'pass',
      '--mocksDir',
      '/tmp',
      '--logging',
      'silent',
    ])
    if (!argsResult.ok) throw argsResult.error
    const args = argsResult.value

    const mocker = new Mocker({ ...args, fs })

    await mocker.listen(0 as HttpPort)

    const socket = net.connect(mocker.port, '127.0.0.1')
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })

    const closePromise = mocker.close()
    const closedWithinDeadline = await Promise.race([
      closePromise.then(() => true),
      sleep(3500).then(() => false),
    ])

    if (!socket.destroyed) {
      const socketClosedPromise = new Promise((resolve) => {
        socket.once('close', resolve)
      })
      socket.destroy()
      await socketClosedPromise
    }
    await closePromise

    expect(closedWithinDeadline).toBe(true)
  })
})
