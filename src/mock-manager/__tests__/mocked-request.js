const { getBody } = require('../../shared/http')
const { createMockedRequest } = require('./helpers/mocked-request')

describe('mockedRequest', () => {
  it('is a duplex stream', async () => {
    expect.assertions(1)

    const mockedRequest = createMockedRequest()

    // Write to the stream
    mockedRequest.write('lorem')
    mockedRequest.write(' ipsum')
    mockedRequest.end(' dolor')

    // Read the written values
    const body = `${await getBody(mockedRequest)}`

    expect(body).toBe('lorem ipsum dolor')
  })
})
