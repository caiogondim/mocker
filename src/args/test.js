const path = require('path')
const {
  parseArgv,
  PORT_DEFAULT,
  RETRIES_DEFAULT,
  LOGGING_DEFAULT,
  LOGGING_VALID_VALUES,
  OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  OVERWRITE_REQUEST_HEADERS_DEFAULT,
  REDACTED_HEADERS_DEFAULT,
  CORS_DEFAULT,
} = require('./index')

function getRequiredArgs() {
  return ['--origin', 'https://example.com', '--responsesDir', 'src/']
}

describe('behavior', () => {
  it('throws an error if argv has an invalid arg', async () => {
    expect.assertions(2)

    const argv1 = ['', '', ...getRequiredArgs()]
    await expect(parseArgv(argv1)).resolves.not.toThrow()

    const argv2 = ['', '', ...getRequiredArgs(), '--foo', 'bar']
    await expect(parseArgv(argv2)).rejects.toMatchInlineSnapshot(`
      [TypeError: [1mTypeError[22m[0m: invalid arg
      [32mExpected[89m[0m one of ["--origin", "--port", "--delay", "--throttle", "--update", "--mode", "--workers", "--responsesDir", "--folder", "--cache", "--logging", "--mockKeys", "--redactedHeaders", "--retries", "--overwriteResponseHeaders", "--overwriteRequestHeaders", "--cors"]
      [31mReceived[89m[0m "--foo"]
    `)
  })

  it('throws an error if argv doesnt respect the `--key value` pattern', async () => {
    expect.assertions(3)

    const argv1 = ['', '', '--origin', 'http://example.com', '--delay']
    await expect(parseArgv(argv1)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: args has invalid shape
            [32mExpected[89m[0m args following the pattern "--arg1 value1 --arg2 value2"
            [31mReceived[89m[0m "http://example.com --delay"]
          `)

    const argv2 = ['', '', ...getRequiredArgs(), '--delay', '100']
    await expect(parseArgv(argv2)).resolves.not.toThrow()

    const argv3 = [
      '',
      '',
      '--origin',
      'http://example.com',
      '--delay',
      '--origin',
    ]
    await expect(parseArgv(argv3)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: args has invalid shape
            [32mExpected[89m[0m args following the pattern "--arg1 value1 --arg2 value2"
            [31mReceived[89m[0m "http://example.com --delay --origin"]
          `)
  })
})

describe('--origin', () => {
  it('throws an error if not set', async () => {
    expect.assertions(1)
    const argv = ['', '', '--port', '8273']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --origin
            [32mExpected[89m[0m valid URL
            [31mReceived[89m[0m ""]
          `)
  })

  it('throws an error if not a valid URL', async () => {
    expect.assertions(1)
    const argv = ['', '', '--origin', 'lorem-ipsum', '--responsesDir', 'src/']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --origin
            [32mExpected[89m[0m valid URL
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })

  it('throws an error if protocol is not http: or https:', async () => {
    expect.assertions(1)
    const argv = [
      '',
      '',
      '--origin',
      'lorem://ipsum.com',
      '--responsesDir',
      'src/',
    ]
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --origin
            [32mExpected[89m[0m URL with HTTP or HTTPS protocol
            [31mReceived[89m[0m "lorem://ipsum.com"]
          `)
  })
})

describe('--port', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.port).toStrictEqual(PORT_DEFAULT)
  })

  it('throws an error if not a positive number', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--port', '-8273']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --port
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "-8273"]
          `)
  })

  it('throws an error if not an integer', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--port', 'lorem-ipsum']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --port
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })

  it('throws an error if port is already in use', async () => {
    expect.assertions(1)

    // Given I have a port already in use
    jest.resetModules()
    jest.doMock('../shared/is-port-taken', () => {
      return async () => true
    })
    // eslint-disable-next-line node/global-require
    const { parseArgv } = require('./index')

    // When I call `parserArgv` passing a `--port` that is already in use
    const argv = ['', '', ...getRequiredArgs(), '--port', `8123`]
    const parseArgvPromise = parseArgv(argv)

    try {
      // Then it should throw an error
      await expect(parseArgvPromise).rejects.toMatchInlineSnapshot(`
              [TypeError: [1mTypeError[22m[0m: invalid --port
              [32mExpected[89m[0m available port on host
              [31mReceived[89m[0m 8123]
            `)
    } finally {
      jest.resetModules()
    }
  })
})

describe('--delay', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.delay).toBe(0)
  })

  it('throws an error if not a positive number', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--delay', '-8273']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --delay
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "-8273"]
          `)
  })

  it('throws an error if not an integer', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--delay', 'lorem-ipsum']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --delay
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })
})

describe('--throttle', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    await expect(args.throttle).toStrictEqual(Infinity)
  })

  it('throws an error if not a positive number', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--throttle', '-8273']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --throttle
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "-8273"]
          `)
  })

  it('throws an error if not an integer', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--throttle', 'lorem-ipsum']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --throttle
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })
})

describe('--mode', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.mode).toBe('pass')
  })

  it('doesnt throw an error for a valid value', async () => {
    expect.assertions(6)

    const validValues = [
      'read',
      'write',
      'read-write',
      'pass',
      'read-pass',
      'pass-read',
    ]

    for (const validValue of validValues) {
      const argv = ['', '', ...getRequiredArgs(), '--mode', validValue]
      await expect(parseArgv(argv)).resolves.not.toThrow()
    }
  })

  it('throws an error for an invalid value', async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--mode',
      'lorem-ipsum',
    ]
    // @ts-ignore
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --mode
            [32mExpected[89m[0m one of ["read", "write", "read-write", "pass-through", "pass", "read-pass", "pass-read"]
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })

  it(`prints warning in case --mode pass-through is used`, async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--mode',
      'pass-through',
      '--logging',
      'verbose',
    ]
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    await parseArgv(argv)
    try {
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledTimes(1)
    } finally {
      consoleLogSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })

  it(`doesn't print warning in case --mode pass-through is used but warn logging is not allowed`, async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--cache',
      'true',
      '--logging',
      'error',
    ]
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    await parseArgv(argv)
    try {
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledTimes(0)
    } finally {
      consoleLogSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })
})

describe('--update', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.update).toBe('off')
  })

  it('doesnt throw an error for a valid value', async () => {
    expect.assertions(3)

    const validValues = ['off', 'startup', 'only']

    for (const validValue of validValues) {
      const argv = ['', '', ...getRequiredArgs(), '--update', validValue]
      await expect(parseArgv(argv)).resolves.not.toThrow()
    }
  })

  it('throws an error for an invalid value', async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--update',
      'lorem-ipsum',
    ]
    // @ts-ignore
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --update
            [32mExpected[89m[0m one of ["off", "startup", "only"]
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })
})

describe('--workers', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.workers).toBe(1)
  })

  it('throws an error if not a positive number', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs(), '--workers', '-6']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --workers
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "-6"]
          `)
  })

  it('throws an error if not an integer', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--workers', 'lorem-ipsum']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --workers
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })

  it('is always a positive Number', async () => {
    expect.assertions(2)

    const argv = ['', '', ...getRequiredArgs(), '--workers', '123']
    const args = await parseArgv(argv)

    expect(typeof args.workers).toBe('number')
    expect(args.workers).toBeGreaterThan(0)
  })
})

describe('--responsesDir', () => {
  it('doesnt throw an error for a valid value', async () => {
    expect.assertions(1)
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--responsesDir',
      'src/',
    ]
    await expect(parseArgv(argv)).resolves.not.toThrow(TypeError)
  })

  it('throws an error for an invalid folder', async () => {
    expect.assertions(1)
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--responsesDir',
      'non-existing-folder',
    ]
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --responsesDir
            [32mExpected[89m[0m a valid folder path
            [31mReceived[89m[0m "non-existing-folder"]
          `)
  })

  it('normalizes to an absolute path', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(path.isAbsolute(args.responsesDir)).toBe(true)
  })

  it('accepts deprecated `--folder` as an alias', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs(), '--folder', 'src']
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    const args = await parseArgv(argv)

    try {
      expect(args.responsesDir.endsWith('/src')).toBe(true)
    } finally {
      consoleLogSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })
})

describe('--folder', () => {
  it(`prints warning in case it is used`, async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--folder',
      'src/',
      '--logging',
      'warn',
    ]
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    await parseArgv(argv)
    try {
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledTimes(1)
    } finally {
      consoleLogSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })

  it(`doesn't print warning in case it is used but warn logging is not allowed`, async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--folder',
      'src/',
      '--logging',
      'error',
    ]
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    await parseArgv(argv)
    try {
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledTimes(0)
    } finally {
      consoleLogSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })
})

describe('--logging', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.logging).toStrictEqual(LOGGING_DEFAULT)
  })

  it('throws an error for invalid values', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs(), '--logging', 'lorem-ipsum']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --logging
            [32mExpected[89m[0m one of ["silent", "error", "warn", "verbose"]
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })

  it('accepts valid values', async () => {
    expect.assertions(4)

    for (const validValue of LOGGING_VALID_VALUES) {
      const argv = ['', '', ...getRequiredArgs(), '--logging', validValue]
      await expect(parseArgv(argv)).resolves.not.toThrow(TypeError)
    }
  })
})

describe('--cache', () => {
  it(`prints warning in case it is used`, async () => {
    expect.assertions(1)

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--cache',
      'true',
      '--logging',
      'verbose',
    ]
    await parseArgv(argv)
    try {
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledTimes(1)
    } finally {
      consoleWarnSpy.mockRestore()
    }
  })

  it(`doesn't print warning in case it is used but warn logging is not allowed`, async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--cache',
      'true',
      '--logging',
      'error',
    ]
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    await parseArgv(argv)
    try {
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledTimes(0)
    } finally {
      consoleLogSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })

  // Cache featured was removed.
  // @see https://github.com/caiogondim/mocker/blob/main/docs/deprecations.md#003
  it('is always false', async () => {
    expect.assertions(8)

    const inputValues = [
      '1',
      'true',
      '{}',
      'false',
      '123123',
      '0',
      'false',
      'null',
    ]

    // Prevents deprecation message from being printed
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

    try {
      for (const inputValue of inputValues) {
        const argv = ['', '', ...getRequiredArgs(), '--cache', inputValue]
        const args = await parseArgv(argv)

        expect(typeof args.cache).toBe('boolean')
      }
    } finally {
      consoleWarnSpy.mockRestore()
    }
  })
})

describe('--mockKeys', () => {
  const validKeys = new Set(['url', 'method', 'body', 'headers'])

  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.mockKeys).toStrictEqual(new Set(['url', 'method']))
  })

  it('throws an error for invalid values', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs(), '--mockKeys', 'lorem-ipsum']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --mockKeys
            [32mExpected[89m[0m set of ["url", "method", "headers", "body"]
            [31mReceived[89m[0m "lorem-ipsum"
            [33mHint[89m[0m The body deep attributes can be used too, e.g.: "body.foo.bar"]
          `)
  })

  it('accepts valid combination', async () => {
    expect.assertions(24)

    const validKeysArr = [...validKeys]

    /**
     * @param {string[]} cur
     * @param {string[]} keys
     * @param {string[][]} combinations
     * @returns {string[][]}
     */
    function combine(cur = [], keys = [...validKeysArr], combinations = []) {
      // eslint-disable-next-line jest/no-conditional-in-test
      if (cur.length >= 4) {
        combinations.push([...cur])
        return combinations
      }

      for (let i = 0; i < keys.length; i += 1) {
        combine(
          [...cur, keys[i]],
          keys.filter((key) => key !== keys[i]),
          combinations
        )
      }

      return combinations
    }
    const combinations = combine()

    for (const combination of combinations) {
      const argv = [
        '',
        '',
        ...getRequiredArgs(),
        '--mockKeys',
        combination.join(','),
      ]
      await expect(parseArgv(argv)).resolves.not.toThrow(Error)
    }
  })
})

describe('--retries', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    expect(args.retries).toStrictEqual(RETRIES_DEFAULT)
  })

  it('accepts a positive integer', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs(), '--retries', '3']
    const args = await parseArgv(argv)

    expect(args.retries).toBe(3)
  })

  it('throws an error if a negative integer', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--retries', '-8273']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --retries
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "-8273"]
          `)
  })

  it('throws an error if not an integer', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs(), '--retries', 'lorem-ipsum']
    await expect(parseArgv(argv)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --retries
            [32mExpected[89m[0m positive integer
            [31mReceived[89m[0m "lorem-ipsum"]
          `)
  })
})

describe('--redactedHeaders', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    expect(args.overwriteResponseHeaders).toStrictEqual(
      REDACTED_HEADERS_DEFAULT
    )
  })

  it('parses value to an object', async () => {
    expect.assertions(1)
    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      '{"nyt-token": null}',
    ]
    const args = await parseArgv(argv)
    expect(args.redactedHeaders).toStrictEqual({
      'nyt-token': null,
    })
  })

  it('throws an error if not a valid JSON', async () => {
    expect.assertions(2)

    // There is a final '}' missing to make it an invalid JSON
    const redactedHeaders1 = '{"content-type": "application/json"'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders1,
    ]
    await expect(parseArgv(argv1)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --redactedHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{\\"content-type\\": \\"application/json\\""]
          `)

    // undefined is not a valid JSON value
    const redactedHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders2,
    ]
    await expect(parseArgv(argv2)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --redactedHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{\\"content-type\\": undefined }"]
          `)
  })

  it('throws an error if not a valid Header type', async () => {
    expect.assertions(4)

    // Invalid since it must be an object at the root level
    const redactedHeaders1 = '[1, 2, 3]'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders1,
    ]
    await expect(parseArgv(argv1)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --redactedHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m [1,2,3]]
          `)

    // Invalid since it cannot have a depth larger than 2
    const redactedHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders2,
    ]
    await expect(parseArgv(argv2)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --redactedHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m {"lorem":{"ipsum":"dolor"}}]
          `)

    // Invalid since it has an array of numbers
    const redactedHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders3,
    ]
    await expect(parseArgv(argv3)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --redactedHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m {"lorem":[1,2,3]}]
          `)

    // Invalid since it has a number as key
    const redactedHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders4,
    ]
    await expect(parseArgv(argv4)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --redactedHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{1: \\"lorem\\"}"]
          `)
  })
})

describe('--overwriteResponseHeaders', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    expect(args.overwriteResponseHeaders).toStrictEqual(
      OVERWRITE_RESPONSE_HEADERS_DEFAULT
    )
  })

  it('parses value to an object', async () => {
    expect.assertions(1)
    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      '{"content-type": "application/json", "host": "example.com"}',
    ]
    const args = await parseArgv(argv)
    expect(args.overwriteResponseHeaders).toStrictEqual({
      'content-type': 'application/json',
      host: 'example.com',
    })
  })

  it('throws an error if not a valid JSON', async () => {
    expect.assertions(2)

    // There is a final '}' missing to make it an invalid JSON
    const overwriteResponseHeaders1 = '{"content-type": "application/json"'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders1,
    ]
    await expect(parseArgv(argv1)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{\\"content-type\\": \\"application/json\\""]
          `)

    // undefined is not a valid JSON value
    const overwriteResponseHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders2,
    ]
    await expect(parseArgv(argv2)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{\\"content-type\\": undefined }"]
          `)
  })

  it('throws an error if not a valid Header type', async () => {
    expect.assertions(4)

    // Invalid since it must be an object at the root level
    const overwriteResponseHeaders1 = '[1, 2, 3]'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders1,
    ]
    await expect(parseArgv(argv1)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m [1,2,3]]
          `)

    // Invalid since it cannot have a depth larger than 2
    const overwriteResponseHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders2,
    ]
    await expect(parseArgv(argv2)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m {"lorem":{"ipsum":"dolor"}}]
          `)

    // Invalid since it has an array of numbers
    const overwriteResponseHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders3,
    ]
    await expect(parseArgv(argv3)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m {"lorem":[1,2,3]}]
          `)

    // Invalid since it has a number as key
    const overwriteResponseHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders4,
    ]
    await expect(parseArgv(argv4)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{1: \\"lorem\\"}"]
          `)
  })
})

describe('--overwriteRequestHeaders', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    expect(args.overwriteRequestHeaders).toStrictEqual(
      OVERWRITE_REQUEST_HEADERS_DEFAULT
    )
  })

  it('parses value to an object', async () => {
    expect.assertions(1)

    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      '{"content-type": "application/json", "host": "example.com"}',
    ]
    const args = await parseArgv(argv)
    expect(args.overwriteRequestHeaders).toStrictEqual({
      'content-type': 'application/json',
      host: 'example.com',
    })
  })

  it('throws an error if not a valid JSON', async () => {
    expect.assertions(2)

    // There is a final '}' missing to make it an invalid JSON
    const overwriteRequestHeaders1 = '{"content-type": "application/json"'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders1,
    ]
    await expect(parseArgv(argv1)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteRequestHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{\\"content-type\\": \\"application/json\\""]
          `)

    // undefined is not a valid JSON value
    const overwriteRequestHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteRequestHeaders2,
    ]
    await expect(parseArgv(argv2)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{\\"content-type\\": undefined }"]
          `)
  })

  it('throws an error if not a valid Header type', async () => {
    expect.assertions(4)

    // Invalid since it must be an object at the root level
    const overwriteRequestHeaders1 = '[1, 2, 3]'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteRequestHeaders1,
    ]
    await expect(parseArgv(argv1)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m [1,2,3]]
          `)

    // Invalid since it cannot have a depth larger than 2
    const overwriteRequestHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteRequestHeaders2,
    ]
    await expect(parseArgv(argv2)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m {"lorem":{"ipsum":"dolor"}}]
          `)

    // Invalid since it has an array of numbers
    const overwriteRequestHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteRequestHeaders3,
    ]
    await expect(parseArgv(argv3)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid Header type { [header: string]: string[] string number null undefined }
            [31mReceived[89m[0m {"lorem":[1,2,3]}]
          `)

    // Invalid since it has a number as key
    const overwriteRequestHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteRequestHeaders4,
    ]
    await expect(parseArgv(argv4)).rejects.toMatchInlineSnapshot(`
            [TypeError: [1mTypeError[22m[0m: invalid --overwriteResponseHeaders
            [32mExpected[89m[0m valid JSON string
            [31mReceived[89m[0m "{1: \\"lorem\\"}"]
          `)
  })
})

describe('--cors', () => {
  it('receives a default value if not set', async () => {
    expect.assertions(1)

    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    expect(args.cors).toStrictEqual(CORS_DEFAULT)
  })

  it.each([
    ['t', true],
    ['y', true],
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('is casted to boolean', async (input, expected) => {
    expect.assertions(1)

    const args = await parseArgv([
      '',
      '',
      ...getRequiredArgs(),
      '--cors',
      input,
    ])
    expect(args.cors).toStrictEqual(expected)
  })
})
