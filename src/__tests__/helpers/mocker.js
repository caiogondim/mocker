/** @typedef {import('../../args/types.js').Args} Args */
/** @typedef {import('../../args/types.js').UnbrandedArgs} UnbrandedArgs */
/** @typedef {import('../../shared/types.js').FsLike} FsLike */

import { Volume, createFsFromVolume } from 'memfs'
import Mocker from '../../index.js'

async function createMemFs() {
  const mocksDir = '/tmp'
  const volume = new Volume()
  const fs = createFsFromVolume(volume)
  await fs.promises.mkdir(mocksDir)

  return {
    mocksDir,
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
    redactedHeaders: {},
    overwriteResponseHeaders: {},
    overwriteRequestHeaders: {},
    port: 0,
  }
}

/**
 * @param {Partial<UnbrandedArgs & { fs: FsLike }>} args
 * @returns {Promise<Mocker>}
 */
async function createMocker(args = {}) {
  if (!('origin' in args)) {
    throw new TypeError('args.origin is missing')
  }

  const { mocksDir, fs } = await createMemFs()
  return new Mocker(
    /** @type {Args & { fs: FsLike }} */ ({
      mocksDir,
      fs,
      origin: '',
      mode: 'read-write',
      cors: false,
      proxy: '',
      ...(await getCommonArgs()),
      ...args,
    }),
  )
}

export { createMocker, createMemFs }
