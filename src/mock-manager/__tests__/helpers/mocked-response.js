import MockedResponse from '../../mocked-response.js'

function createMockedResponse(opts = {}) {
  const defaults = {
    statusCode: 200,
    url: 'http://example.com',
  }

  return new MockedResponse({ ...defaults, ...opts })
}

export { createMockedResponse }
