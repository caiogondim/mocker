module.exports = {
  root: true,
  env: {
    es6: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: [
    'json',
    'prettier',
    'sort-class-members',
    'jest',
    'jest-formatting',
  ],
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'plugin:jest/all',
    'plugin:jest-formatting/strict',
    'plugin:prettier/recommended',
  ],
  rules: {
    'sort-class-members/sort-class-members': [
      2,
      {
        order: [
          '[static-properties]',
          '[static-methods]',
          '[properties]',
          '[conventional-private-properties]',
          'constructor',
          '[methods]',
          '[conventional-private-methods]',
        ],
        accessorPairPositioning: 'getThenSet',
      },
    ],
    'jest/no-conditional-expect': 0,
    'no-lonely-if': 2,
    'no-nested-ternary': 2,
    'max-nested-callbacks': [2, { max: 3 }],
    'constructor-super': 2,
    'no-this-before-super': 2,
    'prefer-spread': 2,
    'import/prefer-default-export': 0,
    'no-console': 2,
    'no-continue': 0,
    'no-restricted-syntax': 0,
    'node/no-unpublished-require': 0,
    'node/no-path-concat': 2,
    'node/callback-return': 2,
    'node/global-require': 2,
    'node/no-sync': 2,
    'node/prefer-promises/dns': 2,
    'node/prefer-promises/fs': 2,
    'node/prefer-global/url-search-params': 2,
    'no-await-in-loop': 0,
    'no-underscore-dangle': 0,
    complexity: ['error', 10],
    'comma-dangle': [
      'error',
      {
        arrays: 'always-multiline',
        objects: 'always-multiline',
        imports: 'always-multiline',
        exports: 'always-multiline',
        functions: 'never',
      },
    ],
    'prettier/prettier': 'error',
  },
}
