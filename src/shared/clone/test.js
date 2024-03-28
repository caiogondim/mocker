const clone = require('.')

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

describe('clone', () => {
  it('clones primitive values', () => {
    expect.assertions(4)

    expect(clone(false)).toBe(false)
    expect(clone(true)).toBe(true)
    expect(clone(223123)).toBe(223123)
    expect(clone(NO_SPOON_UNIVERSAL_TRUTH)).toStrictEqual(
      NO_SPOON_UNIVERSAL_TRUTH
    )
  })

  it('clones an array', () => {
    expect.assertions(6)

    const cloned = clone(BASE_ARRAY)
    expect(cloned).not.toBe(BASE_ARRAY)
    expect(cloned).toStrictEqual(BASE_ARRAY)
    cloned[2][1] = NO_SPOON_UNIVERSAL_TRUTH
    expect(cloned).not.toStrictEqual(BASE_ARRAY)
    expect(BASE_ARRAY[2]).toBe(BASE_ARRAY[2])
    expect(BASE_ARRAY[2][1]).toBe(BASE_ARRAY[2][1])
    expect(cloned[2][1]).toBe(NO_SPOON_UNIVERSAL_TRUTH)
  })

  it('clones an object', () => {
    expect.assertions(5)

    const cloned = clone(BASE_OBJ)
    expect(cloned).not.toBe(BASE_OBJ)
    expect(cloned).toStrictEqual(BASE_OBJ)
    cloned.a.with.some = NO_SPOON_UNIVERSAL_TRUTH
    expect(cloned).not.toStrictEqual(BASE_OBJ)
    expect(BASE_OBJ.a.with.some).toBe(BASE_OBJ.a.with.some)
    expect(cloned.a.with.some).toBe(NO_SPOON_UNIVERSAL_TRUTH)
  })

  it('handles fringe values', () => {
    expect.assertions(5)

    expect(clone(0)).toBe(0)
    expect(clone(Infinity)).toBeNull()
    expect(clone('')).toBe('')
    expect(clone([])).toStrictEqual([])
    expect(clone({})).toStrictEqual({})
  })
})
