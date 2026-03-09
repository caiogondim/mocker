import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/test.js', 'src/**/__tests__/*.js', 'tools/**/test.js'],
    exclude: ['**/__tests__/helpers/**'],
    coverage: {
      include: ['src/**/*.js'],
      thresholds: {
        branches: 78.14,
      },
    },
  },
})
