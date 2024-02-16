const MockedResponse = require('../../mocked-response')

function createMockedResponse(opts = {}) {
  const defaults = {
    statusCode: 200,
    url: 'http://nytimes.com',
  }

  return new MockedResponse({ ...defaults, ...opts })
}

module.exports = {
  createMockedResponse,
}
