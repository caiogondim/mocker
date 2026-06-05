import { pipeline } from 'node:stream/promises'
import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'
import type { AsyncHttpServer } from '../../src/shared/types.js'

function createServer(): AsyncHttpServer {
  let requestNum = 0

  return createAsyncHttpServer(async (req, res) => {
    requestNum = (requestNum % Number.MAX_SAFE_INTEGER) + 1

    const statusCode = requestNum % 3 === 0 ? 200 : 500
    res.writeHead(statusCode, {})
    if (statusCode === 200) {
      await pipeline(req, res)
    } else {
      res.end()
    }
  })
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
