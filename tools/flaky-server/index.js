/** @typedef {import('../../src/shared/types.js').AsyncHttpServer} AsyncHttpServer */

import http from 'node:http'
import { pipeline } from 'node:stream/promises'

/** @returns {AsyncHttpServer} */
function createServer() {
  let requestNum = 0

  const server = http.createServer(async (req, res) => {
    requestNum = (requestNum % Number.MAX_SAFE_INTEGER) + 1

    const statusCode = requestNum % 3 === 0 ? 200 : 500
    res.writeHead(statusCode, {})
    if (statusCode === 200) {
      await pipeline(req, res)
    } else {
      res.end()
    }
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

// @ts-ignore
if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
