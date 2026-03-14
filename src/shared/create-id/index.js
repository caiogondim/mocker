/** @typedef {import('../types.js').ConnectionId} ConnectionId */

import { randomUUID } from 'node:crypto'

/**
 * @returns {ConnectionId}
 */
function createId() {
  return /** @type {ConnectionId} */ (randomUUID())
}

export default createId
