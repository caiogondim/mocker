/** @typedef {import('../../src/shared/types.js').AsyncHttpServer} AsyncHttpServer */

import http from 'node:http'

/** @returns {AsyncHttpServer} */
function createServer() {
  const server = http.createServer(async (req, res) => {
    const reqBodyChunks = []
    for await (const chunk of req) {
      reqBodyChunks.push(chunk)
    }
    const reqBody = Buffer.concat(reqBodyChunks).toString()
    res.end(`${reqBody}${reqBody}`)
  })

  return {
    /**
     * @param {number} port
     * @returns {Promise<void>}
     */
    listen(port) {
      return new Promise((resolve) => {
        server.listen(port, resolve)
      })
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    },
    get listening() {
      return server.listening
    },
    async [Symbol.asyncDispose]() {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        })
      }
    },
  }
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
