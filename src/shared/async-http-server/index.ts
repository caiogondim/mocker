import http from 'node:http'
import type { AsyncHttpServer } from '../types.js'

const SHUTDOWN_TIMEOUT_MS = 3000

function createAsyncHttpServer(
  connectionHandler: Parameters<typeof http.createServer>[1],
): AsyncHttpServer {
  const server = http.createServer(connectionHandler)

  return {
    listen(port: number = 0): Promise<void> {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, () => {
          server.removeListener('error', reject)
          resolve()
        })
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

        // `server.close()` is not reliably chainable across runtimes (Bun's
        // node:http returns undefined), so register the listener on `server`
        // directly rather than on the return value.
        server.once('close', () => {
          clearTimeout(forceCloseTimeout)
        })
        server.close((error) => (error ? reject(error) : resolve()))
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
