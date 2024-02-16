function createAlphabet() {
  const output = []

  for (let i = 'A'.charCodeAt(0); i <= 'Z'.charCodeAt(0); i += 1) {
    output.push(String.fromCharCode(i))
  }

  for (let i = 'a'.charCodeAt(0); i <= 'z'.charCodeAt(0); i += 1) {
    output.push(String.fromCharCode(i))
  }

  for (let i = '0'.charCodeAt(0); i <= '9'.charCodeAt(0); i += 1) {
    output.push(String.fromCharCode(i))
  }

  return output
}

/** @readonly */
const defaultAlphabet = createAlphabet()

/**
 * @param {any[]} arr
 * @returns {number}
 */
function getRandomIndex(arr) {
  return Math.floor(Math.random() * arr.length)
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function getRandomValue(arr) {
  return arr[getRandomIndex(arr)]
}

/**
 * Returns a string with `length` size with random values from `alphabet`.
 *
 * @param {Number} [length]
 * @param {string[]} [alphabet]
 * @returns {string}
 */
function createId(length = 32, alphabet = defaultAlphabet) {
  const output = []

  while (output.length < length) {
    output.push(getRandomValue(alphabet))
  }

  return output.join('')
}

module.exports = createId
