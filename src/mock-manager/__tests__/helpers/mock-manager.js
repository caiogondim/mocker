const { Volume, createFsFromVolume } = require('memfs')
const { MockManager } = require('../..')

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

  return new MockManager({ ...defaults, ...opts })
}

module.exports = {
  createMemFs,
  createMockManager,
}
