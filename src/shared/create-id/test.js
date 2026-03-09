import createId from './index.js'

describe('createId', () => {
  it('creates a valid UUID', () => {
    expect.assertions(1)

    const id = createId()

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it('creates unique ids', () => {
    expect.assertions(1)

    const id1 = createId()
    const id2 = createId()

    expect(id1).not.toBe(id2)
  })
})
