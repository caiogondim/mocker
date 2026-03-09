import net from 'node:net'
import { queue } from '../function-call/index.js'

/**
 * Returns `true` if port is not available. `false` otherwise.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortTaken(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.unref()
    server.once('error', () => {
      resolve(true)
    })
    server.listen({ port }, () => {
      server.close(() => resolve(false))
    })
  })
}

export default queue(isPortTaken)
