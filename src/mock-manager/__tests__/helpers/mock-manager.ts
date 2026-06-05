import type { AbsoluteDirPath } from '../../../args/types.js'

import { createMemoryFs } from '../../../shared/__fixtures__/memory-fs.js'
import { createMockManager as createMockManagerFactory } from '../../index.js'

async function createMemFs() {
  const mocksDir = '/tmp' as AbsoluteDirPath
  const fs = createMemoryFs()
  await fs.promises.mkdir(mocksDir)
  return { mocksDir, fs }
}

type CreateMockManagerOpts = Partial<
  Parameters<typeof createMockManagerFactory>[0]
>

async function createMockManager(opts: CreateMockManagerOpts = {}) {
  const defaults = {
    ...(await createMemFs()),
    origin: '',
  }

  return createMockManagerFactory({ ...defaults, ...opts })
}

export { createMemFs, createMockManager }
