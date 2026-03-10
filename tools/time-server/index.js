/** @typedef {import('../../src/shared/types.js').AsyncHttpServer} AsyncHttpServer */

import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'

/** @returns {AsyncHttpServer} */
function createServer() {
  return createAsyncHttpServer(async (req, res) => {
    res.writeHead(200)
    res.write(`${Date.now()}`)
    res.end()
  })
}

// @ts-ignore
if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
