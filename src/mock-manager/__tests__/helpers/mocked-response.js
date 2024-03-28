const MockedResponse = require('../../mocked-response')

function createMockedResponse(opts = {}) {
  const defaults = {
    statusCode: 200,
    url: 'http://example.com',
  }

  return new MockedResponse({ ...defaults, ...opts })
}

module.exports = {
  createMockedResponse,
}
