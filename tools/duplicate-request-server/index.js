/** @typedef {import('../../src/shared/types.js').AsyncHttpServer} AsyncHttpServer */

import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'

/** @returns {AsyncHttpServer} */
function createServer() {
  return createAsyncHttpServer(async (req, res) => {
    const reqBodyChunks = []
    for await (const chunk of req) {
      reqBodyChunks.push(chunk)
    }
    const reqBody = Buffer.concat(reqBodyChunks).toString()
    res.end(`${reqBody}${reqBody}`)
  })
}

/**
 * @param {Object} options
 * @param {number} options.size
 * @returns {string}
 */
function createPayload({ size }) {
  const reqBodyChunks = []
  for (let i = 0; i < size; i += 1) {
    reqBodyChunks.push(i % 10)
  }
  return reqBodyChunks.join('')
}

// @ts-ignore
if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer, createPayload }
