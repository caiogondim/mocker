/** @typedef {import('../../src/shared/types').AsyncHttpServer} AsyncHttpServer */

const http = require('http')

/** @returns {AsyncHttpServer} */
function createServer() {
  const server = http.createServer(async (req, res) => {
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
