import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'
import type { AsyncHttpServer } from '../../src/shared/types.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function createServer(): AsyncHttpServer {
  return createAsyncHttpServer(async (req, res) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const delay = Number(url.searchParams.get('delay'))
    await sleep(delay)
    res.writeHead(200)
    res.end()
  })
}

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
