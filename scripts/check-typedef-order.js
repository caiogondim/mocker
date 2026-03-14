// Ensures all JSDoc type imports appear before any `import` statements.
// Run as part of lint: node scripts/check-typedef-order.js

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function getJsFiles(dir) {
  const files = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'experiments') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await getJsFiles(full))
    } else if (entry.name.endsWith('.js')) {
      files.push(full)
    }
  }
  return files
}

const root = new URL('..', import.meta.url).pathname
const dirs = [join(root, 'src'), join(root, 'scripts')]
/** @type {string[]} */
const allFiles = []
for (const dir of dirs) {
  allFiles.push(...await getJsFiles(dir))
}

const contents = await Promise.all(allFiles.map((file) => fs.readFile(file, 'utf8')))

/** @type {string[]} */
const errors = []

// Split to avoid this script matching itself
const TYPEDEF_PATTERN = new RegExp('@' + 'typedef')

for (let f = 0; f < allFiles.length; f++) {
  const file = allFiles[f]
  const lines = contents[f].split('\n')
  let firstImportLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) {
      firstImportLine = i
      break
    }
  }
  if (firstImportLine === -1) continue
  for (let i = firstImportLine + 1; i < lines.length; i++) {
    if (TYPEDEF_PATTERN.test(lines[i])) {
      errors.push(`${file}:${i + 1}: @${'typedef'} must appear before import statements`)
    }
  }
}

if (errors.length > 0) {
  throw new Error(errors.join('\n'))
}
