const MockedRequest = require('../../mocked-request')

function createMockedRequest(opts = {}) {
  const defaults = {
    url: 'http://example.com',
    method: 'GET',
  }

  return new MockedRequest({ ...defaults, ...opts })
}

module.exports = {
  createMockedRequest,
}
