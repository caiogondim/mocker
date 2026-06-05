import net from 'node:net'
import { queue } from '../function-call/index.js'

function isPortTaken(port: number): Promise<boolean> {
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
