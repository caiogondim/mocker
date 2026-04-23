import net from 'node:net'

/** @returns {Promise<number>} */
export default function getPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen({ port: 0, exclusive: true }, () => {
      const addr = /** @type {net.AddressInfo} */ (server.address())
      server.close(() => resolve(addr.port))
    })
  })
}
