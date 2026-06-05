import type { IncomingMessage, ServerResponse } from 'node:http'
import { createAsyncHttpServer } from '../../src/shared/async-http-server/index.js'
import type { AsyncHttpServer } from '../../src/shared/types.js'

const commonHeaders = { 'content-type': 'text/plain' }

async function handleGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
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

async function handlePost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
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

function createServer(): AsyncHttpServer {
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

if (process.argv[1] === import.meta.filename) {
  const port = Number(process.argv[2])
  const server = createServer()
  server.listen(port)
}

export { createServer }
