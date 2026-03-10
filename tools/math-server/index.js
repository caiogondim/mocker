/** @typedef {import('../../src/shared/types.js').AsyncHttpServer} AsyncHttpServer */

import http from 'node:http'
import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'

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
  return createAsyncHttpServer(async (req, res) => {
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
}

// @ts-ignore
if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
