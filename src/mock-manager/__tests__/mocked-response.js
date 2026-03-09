import { describe, it, expect } from 'vitest'
import { getBody } from '../../shared/http/index.js'
import { createMockedResponse } from './helpers/mocked-response.js'

describe('mockedResponse', () => {
  it('is a duplex stream', async () => {
    expect.assertions(1)

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
