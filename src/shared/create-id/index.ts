import { randomUUID } from 'node:crypto'
import type { ConnectionId } from '../types.js'

function createId(): ConnectionId {
  return randomUUID() as ConnectionId
}

export default createId
