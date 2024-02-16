const createId = require('.')

describe('createId', () => {
  it('creates an id with characters only present on alphabet parameter', () => {
    expect.assertions(32)

    const alphabet = ['a', 'b', 'c', 'd', 'e']
    const id = createId(32, alphabet)

    for (const char of id) {
      expect(alphabet).toContain(char)
    }
  })

  it('creates an id with a length as passed as argument', () => {
    expect.assertions(1)

    const length = 16
    const id = createId(length)

    expect(id).toHaveLength(length)
  })
})
