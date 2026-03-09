import MockedRequest from '../../mocked-request.js'

function createMockedRequest(opts = {}) {
  const defaults = {
    url: 'http://example.com',
    method: 'GET',
  }

  return new MockedRequest({ ...defaults, ...opts })
}

export { createMockedRequest }
