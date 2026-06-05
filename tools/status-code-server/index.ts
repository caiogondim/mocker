import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'
import type { AsyncHttpServer } from '../../src/shared/types.js'

function createServer(): AsyncHttpServer {
  return createAsyncHttpServer(async (req, res) => {
    if ('response-status-code' in req.headers) {
      const statusCode = Number(req.headers['response-status-code'])
      res.writeHead(statusCode, {})
      res.end()
      return
    }

    res.writeHead(404, {})
    res.end()
    return
  })
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
