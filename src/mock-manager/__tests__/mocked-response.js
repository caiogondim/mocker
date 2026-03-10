import { describe, it, expect } from '@jest/globals'
import { getBody } from '../../shared/http/index.js'
import { createMockedResponse } from './helpers/mocked-response.js'

describe('mockedResponse', () => {
  it('is a duplex stream', async () => {
    const mockedResponse = createMockedResponse()

    // Write to the stream
    mockedResponse.write('lorem')
    mockedResponse.write(' ipsum')
    mockedResponse.end(' dolor')

    // Read the written values
    const body = `${await getBody(mockedResponse)}`

    expect(body).toBe('lorem ipsum dolor')
  })
})
