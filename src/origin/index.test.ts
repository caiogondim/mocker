import { describe, expect, it } from 'bun:test'
import { createServer as createFlakyServer } from '../../tools/flaky-server/index.js'
import { createServer as createMathServer } from '../../tools/math-server/index.js'
import { createServer as createRequestHeaderOnResponseBodyServer } from '../../tools/request-header-on-response-body-server/index.js'
import type { Args, HttpUrl, NonNegativeInteger } from '../args/types.js'
import { getBody } from '../shared/http/index.js'
import { createOrigin } from './index.js'
import { applyRewritePath } from './rewrite-path.js'

function asRules(
  ruleList: { prefix: string; replacement: string }[],
): Args['rewritePath'] {
  return ruleList as unknown as Args['rewritePath']
}

describe('applyRewritePath', () => {
  it('returns the url unchanged when there are no rules', () => {
    expect(applyRewritePath('/api/graphql', asRules([]))).toBe('/api/graphql')
  })

  it('returns the url unchanged when no rule matches', () => {
    expect(
      applyRewritePath(
        '/api/users',
        asRules([{ prefix: '/api/graphql', replacement: '/graphql' }]),
      ),
    ).toBe('/api/users')
  })

  it('rewrites an exact prefix match', () => {
    expect(
      applyRewritePath(
        '/api/graphql',
        asRules([{ prefix: '/api/graphql', replacement: '/graphql' }]),
      ),
    ).toBe('/graphql')
  })

  it('rewrites a prefix followed by more path', () => {
    expect(
      applyRewritePath(
        '/api/users/42',
        asRules([{ prefix: '/api', replacement: '/v2' }]),
      ),
    ).toBe('/v2/users/42')
  })

  it('preserves the query string', () => {
    expect(
      applyRewritePath(
        '/api/graphql?opname=typename',
        asRules([{ prefix: '/api/graphql', replacement: '/graphql' }]),
      ),
    ).toBe('/graphql?opname=typename')
  })

  it('matches only at segment boundaries, not partial segments', () => {
    // `/api` must NOT match `/apiv2` — that is a different segment.
    expect(
      applyRewritePath(
        '/apiv2/users',
        asRules([{ prefix: '/api', replacement: '/v2' }]),
      ),
    ).toBe('/apiv2/users')
  })

  it('matches a prefix that equals the whole path', () => {
    expect(
      applyRewritePath(
        '/api',
        asRules([{ prefix: '/api', replacement: '/v2' }]),
      ),
    ).toBe('/v2')
  })

  it('applies the FIRST matching rule when several overlap', () => {
    // Both rules match `/api/x`; the first must win. If the loop returned the
    // last match this would yield `/B` instead of `/A`.
    expect(
      applyRewritePath(
        '/api/x',
        asRules([
          { prefix: '/api', replacement: '/A' },
          { prefix: '/api/x', replacement: '/B' },
        ]),
      ),
    ).toBe('/A/x')
  })

  it('matches the path before the query string', () => {
    expect(
      applyRewritePath(
        '/api?x=1',
        asRules([{ prefix: '/api', replacement: '/v2' }]),
      ),
    ).toBe('/v2?x=1')
  })
})

describe('origin', () => {
  describe('request()', () => {
    it('overwrites request headers defined on `overwriteRequestHeaders` constructor argument', async () => {
      await using requestHeaderOnResponseBodyServer =
        createRequestHeaderOnResponseBodyServer()
      await requestHeaderOnResponseBodyServer.listen()

      const origin = createOrigin({
        host: `http://localhost:${requestHeaderOnResponseBodyServer.port}` as HttpUrl,
        overwriteRequestHeaders: { lorem: 'ipsum', dolor: 5, host: 'dolor' },
      })
      const result = await origin.request({ url: `/` })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()
      const responseJson = JSON.parse(responseBody)

      expect(responseJson.host).toBe('dolor')
      expect(responseJson.lorem).toBe('ipsum')
      expect(responseJson.dolor).toBe('5')
    })

    it(`removes \`via\` header request header if \`overwriteRequestHeaders\` equals to \`{ via: null }\``, async () => {
      await using requestHeaderOnResponseBodyServer =
        createRequestHeaderOnResponseBodyServer()
      await requestHeaderOnResponseBodyServer.listen()

      const origin = createOrigin({
        host: `http://localhost:${requestHeaderOnResponseBodyServer.port}` as HttpUrl,
        overwriteRequestHeaders: {
          host: 'example.com',
          lorem: 'ipsum',
          dolor: 5,
          via: null,
        },
      })
      const result = await origin.request({ url: `/` })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.end()
      const response = await responsePromise
      const responseBody = (await getBody(response)).toString()
      const responseJson = JSON.parse(responseBody)

      expect(responseJson.lorem).toBe('ipsum')
      expect(responseJson.dolor).toBe('5')
      expect(responseJson.via).toBeUndefined()
    })

    it('retries requests as defined on `retries` constructor argument', async () => {
      // This server always returns a 500 but on every 3rd request.
      await using flakyServer = createFlakyServer()
      await flakyServer.listen()

      const origin = createOrigin({
        host: `http://localhost:${flakyServer.port}` as HttpUrl,
        retries: 3 as NonNegativeInteger,
      })
      const result = await origin.request({
        url: `/`,
        method: 'POST',
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.write('lorem ipsum')
      request.write(' dolor')
      request.end(' sit amet')

      const response = await responsePromise
      expect(response.statusCode).toBe(200)

      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('lorem ipsum dolor sit amet')
    })

    it('applies rewritePath rules to the forwarded url', async () => {
      // The math server only answers on `/`. The client calls `/api/math?...`;
      // the rule must rewrite the path to `/` before the request reaches the
      // origin, proving the rewrite happens at the origin layer.
      await using mathServer = createMathServer()
      await mathServer.listen()

      const origin = createOrigin({
        host: `http://localhost:${mathServer.port}` as HttpUrl,
        rewritePath: asRules([{ prefix: '/api/math', replacement: '/' }]),
      })
      const result = await origin.request({
        url: `/api/math?a=1&b=2&operation=sum`,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.end()

      const response = await responsePromise
      expect(response.statusCode).toBe(200)
      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('3')
    })

    it('accepts absolute URLs', async () => {
      // Given I have a server
      await using mathServer = createMathServer()
      await mathServer.listen()

      // And a mocker server proxying it

      // When I make a request to the mocker server using an absolute URL
      const origin = createOrigin({
        host: `http://localhost:${mathServer.port}` as HttpUrl,
      })
      const result = await origin.request({
        url: `http://localhost:${mathServer.port}?a=1&b=2&operation=sum`,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) throw result.error
      const [request, responsePromise] = result.value
      request.end()

      // Then it should work as it does for relative URLs
      const response = await responsePromise
      expect(response.statusCode).toBe(200)

      const responseBody = await getBody(response)
      expect(responseBody.toString()).toBe('3')
    })
  })
})
