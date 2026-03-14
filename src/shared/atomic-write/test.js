import { describe, it, expect } from '@jest/globals'
import { Volume, createFsFromVolume } from 'memfs'
import atomicWrite from './index.js'

describe('atomicWrite', () => {
  it('returns ok result on success', async () => {
    const volume = new Volume()
    const fs = createFsFromVolume(volume)
    const filePath = '/test.json'
    const content = JSON.stringify({ hello: 'world' })

    const result = await atomicWrite({ filePath, content, fs })

    expect(result.ok).toBe(true)
    const fileContent = await fs.promises.readFile(filePath, 'utf8')
    expect(fileContent).toBe(content)
  })

  it('no temp file remains after success', async () => {
    const volume = new Volume()
    const fs = createFsFromVolume(volume)
    const filePath = '/test.json'
    const content = JSON.stringify({ hello: 'world' })

    await atomicWrite({ filePath, content, fs })

    const files = await fs.promises.readdir('/')
    const tmpFiles = files.filter((f) => String(f).endsWith('.tmp'))
    expect(tmpFiles).toHaveLength(0)
  })

  it('concurrent writes to same path produce valid file', async () => {
    const volume = new Volume()
    const fs = createFsFromVolume(volume)
    const filePath = '/test.json'
    const contents = Array.from({ length: 5 }, (_, i) =>
      JSON.stringify({ index: i }),
    )

    const results = await Promise.all(
      contents.map((content) => atomicWrite({ filePath, content, fs })),
    )

    for (const result of results) {
      expect(result.ok).toBe(true)
    }

    const fileContent = await fs.promises.readFile(filePath, 'utf8')
    const parsed = JSON.parse(/** @type {string} */ (fileContent))
    expect(parsed).toHaveProperty('index')
    expect(contents).toContain(fileContent)
  })

  it('returns error result on write failure', async () => {
    const volume = new Volume()
    const fs = createFsFromVolume(volume)
    const filePath = '/nonexistent/dir/test.json'
    const content = 'hello'

    const result = await atomicWrite({ filePath, content, fs })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error)
    }
  })

  it('cleans up temp file on failure', async () => {
    const volume = new Volume()
    const fs = createFsFromVolume(volume)
    const filePath = '/nonexistent/dir/test.json'
    const content = 'hello'

    await atomicWrite({ filePath, content, fs })

    const rootFiles = await fs.promises.readdir('/')
    const tmpFiles = rootFiles.filter((f) => String(f).endsWith('.tmp'))
    expect(tmpFiles).toHaveLength(0)
  })
})
