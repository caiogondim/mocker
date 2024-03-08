/** @typedef {import('../../src/shared/types').AsyncHttpServer} AsyncHttpServer */

const http = require('http')

/** @returns {AsyncHttpServer} */
function createServer() {
  async function handleRequest(req, res) {
    if (typeof req.url === 'undefined') {
      res.writeHead(500, {})
      res.end()
      return
    }

    res.setHeader('content-type', 'application/json')
    res.write(JSON.stringify(req.headers))
    res.end()
  }
  const server = http.createServer()
  server.on('request', handleRequest)

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
