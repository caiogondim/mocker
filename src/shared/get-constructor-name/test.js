const getConstructorName = require('.')

describe('getConstructorName', () => {
  it(`returns the constructor's name as a string`, () => {
    expect.assertions(23)

    // Object
    expect(getConstructorName({})).toBe('Object')
    expect(getConstructorName(new Object())).toBe('Object')

    // Number
    expect(getConstructorName(1)).toBe('Number')
    expect(getConstructorName(1.2)).toBe('Number')
    expect(getConstructorName(new Number(1.2))).toBe('Number')

    // String
    expect(getConstructorName('lorem')).toBe('String')
    expect(getConstructorName(new String('lorem'))).toBe('String')

    // Array
    expect(getConstructorName([])).toBe('Array')
    expect(getConstructorName([1, 2, 3])).toBe('Array')
    expect(getConstructorName(new Array(1, 2, 3))).toBe('Array')

    // Function
    expect(getConstructorName(() => {})).toBe('Function')
    expect(getConstructorName(function foo() {})).toBe('Function')
    expect(getConstructorName(class Foo {})).toBe('Function')

    // Boolean
    expect(getConstructorName(true)).toBe('Boolean')
    expect(getConstructorName(false)).toBe('Boolean')
    expect(getConstructorName(new Boolean(false))).toBe('Boolean')

    // RegExp
    expect(getConstructorName(/abc/g)).toBe('RegExp')
    expect(getConstructorName(/abc/)).toBe('RegExp')
    expect(getConstructorName(new RegExp('abc', 'g'))).toBe('RegExp')

    // Date
    expect(getConstructorName(new Date())).toBe('Date')

    // Error
    expect(getConstructorName(new Error())).toBe('Error')

    // Null
    expect(getConstructorName(null)).toBe('Null')

    // Undefined
    expect(getConstructorName(undefined)).toBe('Undefined')
  })
})
