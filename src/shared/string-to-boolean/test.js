const stringToBoolean = require('.')

describe('stringToBoolean', () => {
  it('returns true for strings with truthy meaning', () => {
    expect.assertions(4)

    expect(stringToBoolean('1')).toStrictEqual(true)
    expect(stringToBoolean('true')).toStrictEqual(true)
    expect(stringToBoolean('yes')).toStrictEqual(true)
    expect(stringToBoolean('y')).toStrictEqual(true)
  })

  it('returns false for string that doesnt contain a truthy meaning', () => {
    expect.assertions(6)

    expect(stringToBoolean('0')).toStrictEqual(false)
    expect(stringToBoolean('2')).toStrictEqual(false)
    expect(stringToBoolean('false')).toStrictEqual(false)
    expect(stringToBoolean('no')).toStrictEqual(false)
    expect(stringToBoolean('n')).toStrictEqual(false)
    expect(stringToBoolean('lorem')).toStrictEqual(false)
  })
})
