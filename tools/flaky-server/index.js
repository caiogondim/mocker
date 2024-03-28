/** @typedef {import('../../src/shared/types').AsyncHttpServer} AsyncHttpServer */

const http = require('http')
const { pipeline } = require('stream')
const { promisify } = require('util')

const asyncPipeline = promisify(pipeline)

/** @returns {AsyncHttpServer} */
function createServer() {
  let requestNum = 0

  const server = http.createServer(async (req, res) => {
    requestNum = (requestNum % Number.MAX_SAFE_INTEGER) + 1

    const statusCode = requestNum % 3 === 0 ? 200 : 500
    res.writeHead(statusCode, {})
    if (statusCode === 200) {
      await asyncPipeline(req, res)
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
  }
}

// @ts-ignore
if (require.main === module) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

module.exports = { createServer }
