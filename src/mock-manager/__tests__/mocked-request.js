import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getBody } from '../../shared/http/index.js'
import { createMockedRequest } from './helpers/mocked-request.js'

describe('mockedRequest', () => {
  it('is a duplex stream', async () => {
    const mockedRequest = createMockedRequest()

    // Write to the stream
    mockedRequest.write('lorem')
    mockedRequest.write(' ipsum')
    mockedRequest.end(' dolor')

    // Read the written values
    const body = `${await getBody(mockedRequest)}`

    assert.strictEqual(body, 'lorem ipsum dolor')
  })
})
