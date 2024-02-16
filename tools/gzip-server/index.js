/** @typedef {import('../../src/shared/types').AsyncHttpServer} AsyncHttpServer */

const http = require('http')
const { createGzip } = require('zlib')
const { pipeline, Readable } = require('stream')
const { promisify } = require('util')

const asyncPipeline = promisify(pipeline)

/** @returns {AsyncHttpServer} */
function createServer() {
  const server = http.createServer(async (req, res) => {
    const reqBodyChunks = []
    for await (const chunk of req) {
      reqBodyChunks.push(chunk)
    }
    res.writeHead(200, { 'content-encoding': 'gzip' })
    const reqBody = Buffer.concat(reqBodyChunks).toString()
    await asyncPipeline(Readable.from(reqBody), createGzip(), res)
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
if (require.main === module) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

module.exports = { createServer, createPayload }
