const stringToBoolean = require('.')

describe('stringToBoolean', () => {
  it('returns true for strings with truthy meaning', () => {
    expect.assertions(4)

    expect(stringToBoolean('1')).toBe(true)
    expect(stringToBoolean('true')).toBe(true)
    expect(stringToBoolean('yes')).toBe(true)
    expect(stringToBoolean('y')).toBe(true)
  })

  it('returns false for string that doesnt contain a truthy meaning', () => {
    expect.assertions(6)

    expect(stringToBoolean('0')).toBe(false)
    expect(stringToBoolean('2')).toBe(false)
    expect(stringToBoolean('false')).toBe(false)
    expect(stringToBoolean('no')).toBe(false)
    expect(stringToBoolean('n')).toBe(false)
    expect(stringToBoolean('lorem')).toBe(false)
  })
})
