import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import getConstructorName from './index.js'

describe('getConstructorName', () => {
  it(`returns the constructor's name as a string`, () => {
    // Object
    assert.strictEqual(getConstructorName({}), 'Object')
    assert.strictEqual(getConstructorName(new Object()), 'Object')

    // Number
    assert.strictEqual(getConstructorName(1), 'Number')
    assert.strictEqual(getConstructorName(1.2), 'Number')
    assert.strictEqual(getConstructorName(new Number(1.2)), 'Number')

    // String
    assert.strictEqual(getConstructorName('lorem'), 'String')
    assert.strictEqual(getConstructorName(new String('lorem')), 'String')

    // Array
    assert.strictEqual(getConstructorName([]), 'Array')
    assert.strictEqual(getConstructorName([1, 2, 3]), 'Array')
    assert.strictEqual(getConstructorName(new Array(1, 2, 3)), 'Array')

    // Function
    assert.strictEqual(getConstructorName(() => {}), 'Function')
    assert.strictEqual(getConstructorName(function foo() {}), 'Function')
    assert.strictEqual(getConstructorName(class Foo {}), 'Function')

    // Boolean
    assert.strictEqual(getConstructorName(true), 'Boolean')
    assert.strictEqual(getConstructorName(false), 'Boolean')
    assert.strictEqual(getConstructorName(new Boolean(false)), 'Boolean')

    // RegExp
    assert.strictEqual(getConstructorName(/abc/g), 'RegExp')
    assert.strictEqual(getConstructorName(/abc/), 'RegExp')
    assert.strictEqual(getConstructorName(new RegExp('abc', 'g')), 'RegExp')

    // Date
    assert.strictEqual(getConstructorName(new Date()), 'Date')

    // Error
    assert.strictEqual(getConstructorName(new Error()), 'Error')

    // Null
    assert.strictEqual(getConstructorName(null), 'Null')

    // Undefined
    assert.strictEqual(getConstructorName(undefined), 'Undefined')
  })
})
