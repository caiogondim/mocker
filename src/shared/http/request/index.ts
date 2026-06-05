import type { RequestOptions } from 'node:http'
import http from 'node:http'
import https from 'node:https'
import type { Socket as NetSocket } from 'node:net'
import createBackoff from '../../backoff/index.js'
import retry from '../../function-call/retry/index.js'
import { HTTP_METHOD } from '../../http-method/index.js'
import { HTTP_STATUS_CODE } from '../../http-status-code/index.js'
import type { AbsoluteHttpUrl, HttpMethod, Result } from '../../types.js'
import type { Headers, RequestWrite } from '../types.js'

// ---------------------------------------------------------------------------
// BUN-COMPAT(1.3.14): accommodations for Bun's `node:http` behavior.
//
// Each item below is a workaround for a Bun-specific quirk verified on Bun
// 1.3.14. They are greppable by the `BUN-COMPAT(1.3.14)` marker so they can be
// re-evaluated (and ideally removed) on a Bun upgrade. The marker is repeated
// at each site for findability.
//
// 1. agent: false (prepareRequestParams). Bun corrupts a reused keep-alive
//    socket when a prior response was sent without the request body being
//    fully consumed (e.g. an origin returning 5xx and ending immediately):
//    the NEXT request over that socket comes back as a spurious 400. Proven by
//    making sequential keep-alive requests to such a server — every request
//    after an undrained 5xx returns 400; with agent:false the corruption
//    disappears. Mocker shares one process (hence one global agent) across many
//    origin requests, so this is not contained to a single retry chain — a
//    plain request can be poisoned by an unrelated earlier one. Kept global.
//
// 2. The `socket.connecting === false` branch in
//    `waitForRequestSocketConnection`. Under Bun the `socket` event fires after
//    the socket has already left the `connecting` state (for BOTH live and dead
//    origins), so `connect`/`ready` never fire again and a refused origin emits
//    no signal at request-creation time. We therefore resolve optimistically
//    there and rely on the response-promise `error` listener (which fires once
//    the body is written/ended) to surface ECONNREFUSED. On Node the socket is
//    still `connecting` and the `connect` event resolves it normally.
//
// 3. The destroy Proxy + `abortedPromise` in `createRequestWithRetry`. Bun does
//    not emit a terminal `close`/`error` when a request is destroyed before its
//    body is flushed, so the response promise (and the retry loop awaiting it)
//    would hang forever. The Proxy detects destroy and rejects/unblocks them.
// ---------------------------------------------------------------------------

const MAX_RETRY_REPLAY_BUFFER_BYTES = 1024 * 1024 * 1024 // 1GB
const CONNECT_TIMEOUT_MS = 10_000
const RESPONSE_TIMEOUT_MS = 30_000

function createReplayBufferSizeError() {
  return new RangeError(
    `Request body exceeds replay limit of ${MAX_RETRY_REPLAY_BUFFER_BYTES} bytes.`,
  )
}

function createRequestTimeoutError(
  stage: 'connect' | 'response',
  timeoutMs: number,
): Error {
  return new Error(`Request ${stage} timeout after ${timeoutMs}ms.`)
}

function getChunkByteLength(
  chunk: string | Buffer | Uint8Array | (() => void) | undefined,
  encoding: BufferEncoding | undefined,
): number {
  if (chunk === undefined || typeof chunk === 'function') {
    return 0
  }
  if (typeof chunk === 'string') {
    return Buffer.byteLength(chunk, encoding)
  }
  return chunk.byteLength
}

function getNativeRequest(
  protocol: string,
): Result<typeof http.request | typeof https.request, TypeError> {
  if (protocol === 'http:') {
    return { ok: true, value: http.request }
  }
  if (protocol === 'https:') {
    return { ok: true, value: https.request }
  }
  return {
    ok: false,
    error: new TypeError(
      `Only http: or https: protocols are supported. '${protocol}' was passed.`,
    ),
  }
}

function prepareRequestParams(
  urlObj: URL,
  method: HttpMethod,
  headers: Headers,
): {
  method: string
  hostname: string
  host: string
  port: number
  path: string
  headers: Headers
  protocol: string
  agent: false
} {
  const requestParams = {
    method,
    hostname: urlObj.hostname,
    host: urlObj.hostname,
    port: Number(urlObj.port),
    path: `${urlObj.pathname}${urlObj.search}`,
    headers,
    protocol: urlObj.protocol,
    // BUN-COMPAT(1.3.14): fresh connection per request (no shared keep-alive
    // agent). Reusing a keep-alive socket after an undrained 5xx corrupts the
    // next request into a spurious 400. See item 1 of the BUN-COMPAT block at
    // the top of this file. Kept global because mocker shares one agent across
    // all origin requests in the process.
    agent: false as const,
  }

  if (!requestParams.port) {
    if (urlObj.protocol === 'https:') {
      requestParams.port = 443
    } else {
      requestParams.port = 80
    }
  }

  return requestParams
}

function waitForRequestSocketConnection(
  request: http.ClientRequest,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let pendingSocket: NetSocket | undefined

    function cleanup() {
      request.removeListener('error', onError)
      request.removeListener('socket', onSocket)
      if (pendingSocket) {
        pendingSocket.removeListener('connect', onSocketConnect)
        pendingSocket = undefined
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
    }

    function onError(error: Error) {
      cleanup()
      reject(error)
    }

    function onSocketConnect() {
      cleanup()
      resolve(undefined)
    }

    function onSocket(socket: NetSocket) {
      if (socket.connecting) {
        // Node path: socket still handshaking — wait for `connect`. A failed
        // handshake surfaces via the request `error` listener below.
        pendingSocket = socket
        socket.once('connect', onSocketConnect)
        return
      }
      // BUN-COMPAT(1.3.14): the socket is already past `connecting` by the time
      // the `socket` event fires (so `connect`/`ready` will not fire again). A
      // refused connection emits NO signal at this point — Bun does not attempt
      // the TCP connect until the request body is flushed. So treat the request
      // as dispatched and resolve; a refused connection surfaces as an `error`
      // on the response promise once the caller writes/ends the body (handled
      // by `createResponsePromise` and the retry loop). See item 2 of the
      // BUN-COMPAT block at the top of this file.
      onSocketConnect()
    }

    timeoutId = setTimeout(() => {
      request.destroy(createRequestTimeoutError('connect', CONNECT_TIMEOUT_MS))
    }, CONNECT_TIMEOUT_MS)
    timeoutId.unref()

    request.on('error', onError)
    request.on('socket', onSocket)
  })
}

function createResponsePromise(
  request: http.ClientRequest,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    let settled = false

    function onResponse(response: http.IncomingMessage) {
      if (settled) return
      settled = true
      cleanup()
      resolve(response)
    }
    function onError(error: Error) {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    function onTimeout() {
      request.destroy(
        createRequestTimeoutError('response', RESPONSE_TIMEOUT_MS),
      )
    }
    function cleanup() {
      request.setTimeout(0)
      request.removeListener('response', onResponse)
      request.removeListener('error', onError)
    }

    request.setTimeout(RESPONSE_TIMEOUT_MS, onTimeout)
    request.on('response', onResponse)
    request.on('error', onError)
  })
}

async function createRequest({
  url,
  headers = {},
  method = HTTP_METHOD.GET,
}: {
  url: AbsoluteHttpUrl
  headers?: Headers
  method?: HttpMethod
}): Promise<[http.ClientRequest, Promise<http.IncomingMessage>]> {
  const urlObj = new URL(url)
  const nativeRequestResult = getNativeRequest(urlObj.protocol)
  if (!nativeRequestResult.ok) {
    throw nativeRequestResult.error
  }
  const nativeRequest = nativeRequestResult.value
  const requestParams = prepareRequestParams(urlObj, method, headers)
  // Dispatch optimistically. A refused/unreachable origin does NOT surface
  // here under Bun: `node:http` defers the TCP connect until the body is
  // flushed (see BUN-COMPAT note above), so `createRequest` resolves and the
  // connection error surfaces later on `responsePromise`'s `error` listener —
  // once the caller writes/ends the body, which every production path does
  // (`#respondFromOrigin` pipes the client body into the origin request) and
  // the retry loop replays. The Node path is handled in
  // `waitForRequestSocketConnection`.
  const request = nativeRequest(requestParams as RequestOptions)
  await waitForRequestSocketConnection(request)
  const responsePromise = createResponsePromise(request)

  return [request, responsePromise]
}

function isSuccessfulStatusCode(statusCode: number | undefined): boolean {
  return (
    typeof statusCode === 'number' &&
    statusCode < HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR
  )
}

/**
 * Intercepts write/end calls on a request to record them for replay during
 * retries. Uses Proxy to transparently wrap the original methods, preserving
 * correct `this` binding and argument forwarding.
 */
function attachReplayRecorder(request: http.ClientRequest): {
  getWriteCalls: () => Parameters<RequestWrite>[]
  getEndCall: () => Parameters<http.ClientRequest['end']> | []
} {
  const requestWriteCalls: Parameters<RequestWrite>[] = []
  let requestEndCall: Parameters<http.ClientRequest['end']> | [] = [] as []
  let replayBufferBytes = 0

  function reserveReplayBufferBytes(nextChunkByteLength: number) {
    if (
      replayBufferBytes + nextChunkByteLength >
      MAX_RETRY_REPLAY_BUFFER_BYTES
    ) {
      throw createReplayBufferSizeError()
    }
    replayBufferBytes += nextChunkByteLength
  }

  request.write = new Proxy(request.write, {
    apply(target, thisArg, args) {
      const [chunk, encoding] = args as Parameters<RequestWrite>
      reserveReplayBufferBytes(
        getChunkByteLength(chunk, encoding as BufferEncoding | undefined),
      )
      requestWriteCalls.push(args as Parameters<RequestWrite>)
      return target.apply(thisArg, args as Parameters<RequestWrite>)
    },
  })

  request.end = new Proxy(request.end, {
    apply(target, thisArg, args) {
      const requestEndArgs = args as Parameters<http.ClientRequest['end']>
      const [chunk, encoding] = requestEndArgs
      reserveReplayBufferBytes(
        getChunkByteLength(
          chunk as string | Buffer | Uint8Array | (() => void) | undefined,
          encoding as BufferEncoding | undefined,
        ),
      )
      requestEndCall = requestEndArgs
      return target.apply(thisArg, requestEndArgs)
    },
  })

  return {
    getWriteCalls: () => requestWriteCalls,
    getEndCall: () => requestEndCall,
  }
}

function drainResponse(response: http.IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    function cleanup() {
      response.removeListener('end', onDone)
      response.removeListener('close', onDone)
      response.removeListener('error', onDone)
    }

    function onDone() {
      cleanup()
      resolve()
    }

    response.once('end', onDone)
    response.once('close', onDone)
    response.once('error', onDone)
    response.resume()
  })
}

async function createRequestWithRetry({
  url,
  headers = {},
  method = HTTP_METHOD.GET,
  retries = 0,
  backoff = createBackoff(),
}: {
  url: AbsoluteHttpUrl
  headers?: Headers
  method?: HttpMethod
  retries?: number
  backoff?: () => Promise<void>
}): Promise<
  | { ok: true; value: [http.ClientRequest, Promise<http.IncomingMessage>] }
  | { ok: false; error: Error }
> {
  if (retries === 0) {
    try {
      const result = await createRequest({ url, headers, method })
      return { ok: true, value: result }
    } catch (error) {
      return { ok: false, error: error as Error }
    }
  }

  const retryResult = await retry(
    () => createRequest({ url, headers, method }),
    {
      retries,
      backoff,
    },
  )
  if (!retryResult.ok) {
    return { ok: false, error: retryResult.error }
  }
  const [request, responsePromise] = retryResult.value
  const responseAttemptLimit = Math.max(1, retries)
  const replayRecorder = attachReplayRecorder(request)

  //
  // Creates a deferred (a Promise that can be resolved/rejected from the outside)
  //

  const {
    resolve: resolveResponse,
    reject: rejectResponse,
    promise: responseWithRetryPromise,
  } = Promise.withResolvers() as PromiseWithResolvers<http.IncomingMessage>

  // BUN-COMPAT(1.3.14): if the caller destroys the request, settle the deferred
  // and abandon the retry loop. Bun does not emit a terminal `close`/`error`
  // event for a request destroyed synchronously before its body is flushed, so
  // the response promise (and the loop awaiting it) would otherwise hang
  // forever. See item 3 of the BUN-COMPAT block at the top of this file.
  // We expose the abort as a rejected promise (`abortedPromise`) and race every
  // in-loop await against it, so a loop parked on `await responsePromise` is
  // unblocked the moment destroy fires — not only at the top-of-loop check.
  let aborted = false
  const abortError = new Error(
    'Request destroyed before a response was received.',
  )
  const { reject: rejectAborted, promise: abortedPromise } =
    Promise.withResolvers<never>()
  // Avoid an unhandled rejection if the loop finishes before destroy is called.
  abortedPromise.catch(() => {})
  request.destroy = new Proxy(request.destroy, {
    apply(target, thisArg, args) {
      if (!aborted) {
        aborted = true
        const error = (args[0] as Error | undefined) ?? abortError
        rejectResponse(error)
        rejectAborted(error)
      }
      return target.apply(
        thisArg,
        args as Parameters<http.ClientRequest['destroy']>,
      )
    },
  })

  //
  // Retry loop
  //

  async function runResponseRetryLoop() {
    for (
      let responseAttempt = 0;
      responseAttempt < responseAttemptLimit;
      responseAttempt += 1
    ) {
      if (aborted) return
      const isFirstAttempt = responseAttempt === 0
      const isLastAttempt = responseAttempt + 1 >= responseAttemptLimit

      try {
        let response: http.IncomingMessage

        if (isFirstAttempt) {
          response = await Promise.race([responsePromise, abortedPromise])
        } else {
          const [retryRequest, retryResponsePromise] = await createRequest({
            url,
            headers,
            method,
          })
          for (const requestWriteCall of replayRecorder.getWriteCalls()) {
            retryRequest.write(...requestWriteCall)
          }
          retryRequest.end(...replayRecorder.getEndCall())
          response = await Promise.race([retryResponsePromise, abortedPromise])
        }

        if (isSuccessfulStatusCode(response.statusCode) || isLastAttempt) {
          resolveResponse(response)
          return
        }

        await drainResponse(response)
      } catch (error) {
        // A destroy unblocks the awaits above via `abortedPromise`; stop the
        // loop (the deferred is already rejected by the destroy Proxy).
        if (aborted) return
        if (isLastAttempt) {
          rejectResponse(error)
          return
        }
      }

      await backoff()
    }
  }
  setTimeout(() => {
    runResponseRetryLoop().catch(rejectResponse)
  }, 0).unref()

  return { ok: true, value: [request, responseWithRetryPromise] }
}

export default createRequestWithRetry
