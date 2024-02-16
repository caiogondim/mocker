/** @typedef {import('../../src/shared/types').AsyncHttpServer} AsyncHttpServer */

const http = require('http')

const commonHeaders = { 'content-type': 'text/plain' }

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {Promise<void>}
 */
async function handleGet(req, res) {
  if (typeof req.url === 'undefined') {
    res.writeHead(500, {})
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const a = Number.parseInt(url.searchParams.get('a') || '0', 10)
  const b = Number.parseInt(url.searchParams.get('b') || '0', 10)
  const operation = url.searchParams.get('operation')

  if (operation === 'sum') {
    res.writeHead(200, commonHeaders)
    res.write(`${a + b}`)
  } else if (operation === 'multiply') {
    res.writeHead(200, commonHeaders)
    res.write(`${a * b}`)
  } else {
    res.writeHead(500, commonHeaders)
  }
  res.end()
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {Promise<void>}
 */
async function handlePost(req, res) {
  const reqBody = []
  for await (const chunk of req) {
    reqBody.push(chunk)
  }
  const reqBodyJson = JSON.parse(Buffer.concat(reqBody).toString())
  const { operation, a = 0, b = 0 } = reqBodyJson

  if (operation === 'sum') {
    res.writeHead(200, commonHeaders)
    res.write(`${a + b}`)
  } else if (operation === 'multiply') {
    res.writeHead(200, commonHeaders)
    res.write(`${a * b}`)
  } else {
    res.writeHead(500, commonHeaders)
  }

  res.end()
}

/** @returns {AsyncHttpServer} */
function createServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET') {
      await handleGet(req, res)
      return
    }
    if (req.method === 'POST') {
      await handlePost(req, res)
      return
    }
    res.writeHead(404, {})
    res.end()
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
