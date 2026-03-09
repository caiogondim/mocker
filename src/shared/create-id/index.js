import { randomUUID } from 'node:crypto'

function createId() {
  return randomUUID()
}

export default createId
