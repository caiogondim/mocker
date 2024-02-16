const clone = require('.')

const OLD_ENV = process.env
const QUIJOTE_INTRO =
  'En un lugar de la mancha de cuyo nombre no quiero acordarme'
const BASE_OBJ = {
  some: 'value',
  where: 'there is',
  a: {
    secret: 'super secret',
    with: {
      some: 'deep levels',
    },
  },
  quijotest: QUIJOTE_INTRO,
  hidalgo: 'Don Quijote de la Mancha',
}
const WARP3 = 'Give me warp three, Mr. Sulu'
const NO_SPOON_UNIVERSAL_TRUTH = 'There is no spoon'

/** @type {any[]} */
const BASE_ARRAY = [1, 345, [25, WARP3], 'quijotest']

let obj = { ...BASE_OBJ }
let arr = [...BASE_ARRAY]

function setup() {
  obj = { ...BASE_OBJ }
  arr = [...BASE_ARRAY]

  process.env = { ...OLD_ENV }
}

describe('clone', () => {
  it('clones primitive values', () => {
    expect.assertions(4)
    setup()

    expect(clone(false)).toBe(false)
    expect(clone(true)).toBe(true)
    expect(clone(223123)).toBe(223123)
    expect(clone(NO_SPOON_UNIVERSAL_TRUTH)).toStrictEqual(
      NO_SPOON_UNIVERSAL_TRUTH
    )
  })

  it('clones an array', () => {
    expect.assertions(6)
    setup()

    const cloned = clone(arr)
    expect(cloned).not.toBe(arr)
    expect(cloned).toStrictEqual(arr)
    cloned[2][1] = NO_SPOON_UNIVERSAL_TRUTH
    expect(cloned).not.toStrictEqual(arr)
    expect(arr[2]).toBe(BASE_ARRAY[2])
    expect(arr[2][1]).toBe(BASE_ARRAY[2][1])
    expect(cloned[2][1]).toBe(NO_SPOON_UNIVERSAL_TRUTH)
  })

  it('clones an object', () => {
    expect.assertions(5)
    setup()

    const cloned = clone(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned).toStrictEqual(obj)
    cloned.a.with.some = NO_SPOON_UNIVERSAL_TRUTH
    expect(cloned).not.toStrictEqual(obj)
    expect(obj.a.with.some).toBe(BASE_OBJ.a.with.some)
    expect(cloned.a.with.some).toBe(NO_SPOON_UNIVERSAL_TRUTH)
  })

  it('handles fringe values', () => {
    expect.assertions(6)
    setup()

    // @ts-ignore
    expect(clone()).toBeUndefined()
    expect(clone(0)).toBe(0)
    expect(clone(Infinity)).toBeNull()
    expect(clone('')).toBe('')
    expect(clone([])).toStrictEqual([])
    expect(clone({})).toStrictEqual({})
  })
})
