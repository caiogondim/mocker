import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import createId from './index.js'

describe('createId', () => {
  it('creates a valid UUID', () => {
    const id = createId()

    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('creates unique ids', () => {
    const id1 = createId()
    const id2 = createId()

    assert.notStrictEqual(id1, id2)
  })
})
