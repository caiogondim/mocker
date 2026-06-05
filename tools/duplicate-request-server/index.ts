import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'
import type { AsyncHttpServer } from '../../src/shared/types.js'

function createServer(): AsyncHttpServer {
  return createAsyncHttpServer(async (req, res) => {
    const reqBodyChunks = []
    for await (const chunk of req) {
      reqBodyChunks.push(chunk)
    }
    const reqBody = Buffer.concat(reqBodyChunks).toString()
    res.end(`${reqBody}${reqBody}`)
  })
}

function createPayload({ size }: { size: number }): string {
  const reqBodyChunks = []
  for (let i = 0; i < size; i += 1) {
    reqBodyChunks.push(i % 10)
  }
  return reqBodyChunks.join('')
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createPayload, createServer }
