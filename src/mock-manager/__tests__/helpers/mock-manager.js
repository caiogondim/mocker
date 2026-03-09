import { Volume, createFsFromVolume } from 'memfs'
import { createMockManager as createMockManagerFactory } from '../../index.js'

async function createMemFs() {
  const responsesDir = '/tmp'
  const volume = new Volume()
  const fs = createFsFromVolume(volume)
  await fs.promises.mkdir(responsesDir)

  return { responsesDir, fs }
}

async function createMockManager(opts = {}) {
  const defaults = {
    ...(await createMemFs()),
    origin: '',
  }

  return createMockManagerFactory({ ...defaults, ...opts })
}

export { createMemFs, createMockManager }
