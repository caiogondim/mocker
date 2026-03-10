/** @typedef {import('../../src/shared/types.js').AsyncHttpServer} AsyncHttpServer */

import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** @returns {AsyncHttpServer} */
function createServer() {
  return createAsyncHttpServer(async (req, res) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    let delay = Number(url.searchParams.get('delay'))
    await sleep(delay)
    res.writeHead(200)
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
