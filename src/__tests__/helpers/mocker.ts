import type { Args, UnbrandedArgs } from '../../args/types.js'
import Mocker from '../../index.js'

import { createMemoryFs } from '../../shared/__fixtures__/memory-fs.js'
import type { FsLike } from '../../shared/types.js'

async function createMemFs() {
  const mocksDir = '/tmp'
  const fs = createMemoryFs()
  await fs.promises.mkdir(mocksDir)

  return {
    mocksDir,
    fs,
  }
}

async function getCommonArgs() {
  const mockKeys: Args['mockKeys'] = new Set(['url', 'method', 'body.values'])

  const update: Args['update'] = 'off'

  const logging: Args['logging'] = 'silent'

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

async function createMocker(
  args: Partial<UnbrandedArgs & { fs: FsLike }> = {},
): Promise<Mocker> {
  if (!('origin' in args)) {
    throw new TypeError('args.origin is missing')
  }

  const { mocksDir, fs } = await createMemFs()
  return new Mocker({
    mocksDir,
    fs,
    origin: '',
    mode: 'read-write',
    cors: false,
    proxy: '',
    rewritePath: [],
    ...(await getCommonArgs()),
    ...args,
  } as Args & { fs: FsLike })
}

export { createMemFs, createMocker }
