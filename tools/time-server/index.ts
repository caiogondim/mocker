import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'
import type { AsyncHttpServer } from '../../src/shared/types.js'

function createServer(): AsyncHttpServer {
  return createAsyncHttpServer(async (_req, res) => {
    res.writeHead(200)
    res.write(`${Date.now()}`)
    res.end()
  })
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
