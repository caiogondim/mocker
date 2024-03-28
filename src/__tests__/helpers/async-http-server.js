/** @typedef {import('../../shared/types').AsyncHttpServer} AsyncHttpServer */

const http = require('http')

/**
 * @param {AsyncHttpServer} server
 * @returns {Promise<void>}
 */
async function closeServer(server) {
  if (server && server.listening) {
    await server.close()
  }
}

/**
 * @param {Parameters<typeof http.createServer>[1]} connectionHandler
 * @returns {AsyncHttpServer}
 */
function createServer(connectionHandler) {
  const server = http.createServer(connectionHandler)

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

module.exports = { closeServer, createServer }
