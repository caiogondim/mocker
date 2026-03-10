/** @typedef {import('../types.js').AsyncHttpServer} AsyncHttpServer */

import http from 'node:http'

/**
 * @param {Parameters<typeof http.createServer>[1]} connectionHandler
 * @returns {AsyncHttpServer}
 */
function createAsyncHttpServer(connectionHandler) {
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
      if (!server.listening) return Promise.resolve()
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
    get listening() {
      return server.listening
    },
    async [Symbol.asyncDispose]() {
      await this.close()
    },
  }
}

export { createAsyncHttpServer }
