/** @typedef {import('../../args/types.js').Args} Args */
/** @typedef {import('../../shared/types.js').FsLike} FsLike */

import getPort from 'get-port'
import { Volume, createFsFromVolume } from 'memfs'
import Mocker from '../../index.js'

async function createMemFs() {
  const responsesDir = '/tmp'
  const volume = new Volume()
  const fs = createFsFromVolume(volume)
  await fs.promises.mkdir(responsesDir)

  return {
    responsesDir,
    fs,
  }
}

async function getCommonArgs() {
  /** @type {Args['mockKeys']} */
  const mockKeys = new Set(['url', 'method', 'body.values'])

  /** @type {Args['update']} */
  const update = 'off'

  /** @type {Args['logging']} */
  const logging = 'silent'

  return {
    mockKeys,
    update,
    logging,
    delay: 0,
    throttle: Infinity,
    retries: 0,
    workers: 1,
    redactedHeaders: {},
    overwriteResponseHeaders: {},
    overwriteRequestHeaders: {},
    port: await getPort(),
  }
}

/**
 * @param {Partial<Args & { fs: FsLike }>} args
 * @returns {Promise<Mocker>}
 */
async function createMocker(args = {}) {
  if (!('origin' in args)) {
    throw new TypeError('args.origin is missing')
  }

  const { responsesDir, fs } = await createMemFs()
  return new Mocker({
    responsesDir,
    fs,
    origin: '',
    mode: 'read-write',
    cors: false,
    ...(await getCommonArgs()),
    ...args,
  })
}

export { createMocker, createMemFs }
