import net from 'node:net'

export default function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen({ port: 0, exclusive: true }, () => {
      const addr = server.address() as net.AddressInfo
      server.close(() => resolve(addr.port))
    })
  })
}
