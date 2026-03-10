import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import nodePlugin from 'eslint-plugin-n'

export default [
  { ignores: ['node_modules/', 'out/'] },

  js.configs.recommended,
  nodePlugin.configs['flat/recommended-module'],

  // TypeScript parser for JS files (checkJs in tsconfig)
  {
    files: ['**/*.js'],
    languageOptions: {
      ...tseslint.configs.base.languageOptions,
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      // Variables
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Style
      'no-lonely-if': 'error',
      'no-nested-ternary': 'error',
      'max-nested-callbacks': ['error', { max: 3 }],
      'prefer-spread': 'error',
      'no-console': 'error',
      complexity: ['error', 10],

      // Node.js
      'n/no-unpublished-import': 'off',
      'n/no-extraneous-import': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-path-concat': 'error',
      'n/callback-return': 'error',
      'n/no-sync': 'error',
      'n/prefer-promises/dns': 'error',
      'n/prefer-promises/fs': 'error',
      'n/prefer-global/url-search-params': 'error',
      'n/no-missing-import': 'off',
    },
  },
]
