import type { Args, HttpUrl, NonNegativeInteger } from '../args/types.js'
import type { Headers } from '../shared/http/index.js'
import { createRequest } from '../shared/http/index.js'
import { HTTP_METHOD } from '../shared/http-method/index.js'
import type { AbsoluteHttpUrl, HttpMethod } from '../shared/types.js'
import { applyRewritePath } from './rewrite-path.js'

function createOrigin({
  host,
  retries = 0 as NonNegativeInteger,
  overwriteRequestHeaders = {},
  proxyUrl,
  rewritePath = [],
}: {
  host: HttpUrl
  retries?: NonNegativeInteger
  overwriteRequestHeaders?: Headers
  proxyUrl?: HttpUrl
  rewritePath?: Args['rewritePath']
}) {
  const parsedProxyUrl = proxyUrl ? new URL(proxyUrl) : null

  async function request({
    url,
    headers = {},
    method = HTTP_METHOD.GET,
  }: {
    url: string
    headers?: Headers
    method?: HttpMethod
  }): ReturnType<typeof createRequest> {
    const headersCopy = { ...headers }
    const absoluteUrl = getAbsoluteUrl(applyRewritePath(url, rewritePath))

    for (const [key, value] of Object.entries(overwriteRequestHeaders)) {
      if (value === null || value === undefined) {
        delete headersCopy[key]
      } else {
        headersCopy[key] = value
      }
    }

    // When using a proxy, rewrite the URL to go through it
    const requestUrl = parsedProxyUrl
      ? rewriteUrlForProxy(absoluteUrl, parsedProxyUrl)
      : absoluteUrl

    const result = await createRequest({
      url: requestUrl,
      headers: headersCopy,
      method,
      retries,
    })

    if (!result.ok) {
      return result
    }

    return { ok: true, value: result.value }
  }

  function getAbsoluteUrl(url: string): AbsoluteHttpUrl {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url as AbsoluteHttpUrl
    }
    return `${host}${url}` as AbsoluteHttpUrl
  }

  return { request }
}

function rewriteUrlForProxy(
  absoluteUrl: AbsoluteHttpUrl,
  parsedProxyUrl: URL,
): AbsoluteHttpUrl {
  const original = new URL(absoluteUrl)
  original.protocol = parsedProxyUrl.protocol
  original.hostname = parsedProxyUrl.hostname
  original.port = parsedProxyUrl.port
  return original.toString() as AbsoluteHttpUrl
}

export { createOrigin }
