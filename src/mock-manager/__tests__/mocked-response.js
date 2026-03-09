import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
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

    assert.strictEqual(body, 'lorem ipsum dolor')
  })
})
