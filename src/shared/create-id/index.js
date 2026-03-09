const { randomUUID } = require('node:crypto')

function createId() {
  return randomUUID()
}

module.exports = createId
