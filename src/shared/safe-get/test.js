const safeGet = require('.')

describe('safeGet', () => {
  it('doesnt throw in case a property is queried on an undefined object', () => {
    expect.assertions(1)
    expect(safeGet({}, ['lorem', 'ipsum', 'dolor'])).toBeUndefined()
  })

  it('returns value of deep properties', () => {
    expect.assertions(2)

    const obj = {
      lorem: {
        ipsum: {
          dolor: {
            sit: 7,
          },
        },
      },
    }
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit'])).toBe(7)
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor'])).toBe(
      obj.lorem.ipsum.dolor
    )
  })

  it('returns undefined for not existing deep properties', () => {
    expect.assertions(5)

    const obj = {
      lorem: {
        ipsum: {
          dolor: 'sit',
        },
      },
    }
    expect(safeGet(obj, ['quijotest'])).toBeUndefined()
    expect(safeGet(obj, ['lorem', 'quijotest'])).toBeUndefined()
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit'])).toBeUndefined()
    expect(
      safeGet(obj, ['lorem', 'ipsum', 'dolor', 'sit', 'amet'])
    ).toBeUndefined()
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor'])).toBe(
      obj.lorem.ipsum.dolor
    )
  })

  it('works with arrays', () => {
    expect.assertions(3)

    const obj = {
      lorem: {
        ipsum: {
          dolor: [1, 2, 3],
        },
      },
    }
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', '0'])).toBe(1)
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', '1'])).toBe(2)
    expect(safeGet(obj, ['lorem', 'ipsum', 'dolor', '2'])).toBe(3)
  })
})
