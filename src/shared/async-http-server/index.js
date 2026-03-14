/** @typedef {import('../types.js').AsyncHttpServer} AsyncHttpServer */

import http from 'node:http'

const SHUTDOWN_TIMEOUT_MS = 3000

/**
 * @param {Parameters<typeof http.createServer>[1]} connectionHandler
 * @returns {AsyncHttpServer}
 */
function createAsyncHttpServer(connectionHandler) {
  const server = http.createServer(connectionHandler)

  return {
    /**
     * @param {number} [port]
     * @returns {Promise<void>}
     */
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, resolve)
      })
    },
    close() {
      if (!server.listening) return Promise.resolve()
      return new Promise((resolve, reject) => {
        const forceCloseTimeout = setTimeout(() => {
          if (typeof server.closeIdleConnections === 'function') {
            server.closeIdleConnections()
          }
          if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections()
          }
        }, SHUTDOWN_TIMEOUT_MS)

        server
          .close((error) => (error ? reject(error) : resolve()))
          .once('close', () => {
            clearTimeout(forceCloseTimeout)
          })
      })
    },
    get listening() {
      return server.listening
    },
    get port() {
      const addr = server.address()
      if (addr && typeof addr === 'object') return addr.port
      return 0
    },
    async [Symbol.asyncDispose]() {
      await this.close()
    },
  }
}

export { createAsyncHttpServer }
