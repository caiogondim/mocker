import { describe, expect, it } from 'bun:test'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import {
  CORS_DEFAULT,
  LOGGING_DEFAULT,
  LOGGING_VALID_VALUES,
  OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  PORT_DEFAULT,
  parseArgv,
  REDACTED_HEADERS_DEFAULT,
  RETRIES_DEFAULT,
} from './index.js'
import type { UnbrandedRewritePathRule } from './types.js'

function getRequiredArgs() {
  return ['--origin', 'https://example.com']
}

describe('behavior', () => {
  it('throws an error if argv has an invalid arg', async () => {
    const argv1 = ['', '', ...getRequiredArgs()]
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(true)

    const argv2 = ['', '', ...getRequiredArgs(), '--foo', 'bar']
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(false)
    if (!result2.ok) expect(result2.error.message).toMatch(/invalid arg/)
  })

  it('throws an error if argv doesnt respect the `--key value` pattern', async () => {
    const argv1 = ['', '', '--origin', 'http://example.com', '--delay']
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(false)
    if (!result1.ok)
      expect(result1.error.message).toMatch(/args has invalid shape/)

    const argv2 = ['', '', ...getRequiredArgs(), '--delay', '100']
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(true)

    const argv3 = [
      '',
      '',
      '--origin',
      'http://example.com',
      '--delay',
      '--origin',
    ]
    const result3 = await parseArgv(argv3)
    expect(result3.ok).toBe(false)
    if (!result3.ok)
      expect(result3.error.message).toMatch(/args has invalid shape/)
  })
})

describe('--origin', () => {
  it('throws an error if not set', async () => {
    const argv = ['', '', '--port', '8273']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --origin/)
  })

  it('throws an error if not a valid URL', async () => {
    const argv = ['', '', '--origin', 'lorem-ipsum']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --origin/)
  })

  it('throws an error if protocol is not http: or https:', async () => {
    const argv = ['', '', '--origin', 'lorem://ipsum.com']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --origin/)
  })
})

describe('--port', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.port).toEqual(PORT_DEFAULT)
  })

  it('throws an error if not a positive number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--port', '-8273']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --port/)
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--port', 'lorem-ipsum']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --port/)
  })

  it('throws an error if port is already in use', async () => {
    // Given I have a port already in use — bind an actual port
    const net = await import('node:net')
    const server = net.default.createServer()
    await new Promise((resolve) => server.listen(0, () => resolve(undefined)))
    const takenPort = (server.address() as AddressInfo).port

    // When I call `parserArgv` passing a `--port` that is already in use
    const argv = ['', '', ...getRequiredArgs(), '--port', `${takenPort}`]

    try {
      // Then it should return an error
      const result = await parseArgv(argv)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toMatch(/invalid --port/)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

describe('--delay', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.delay as number).toBe(0)
  })

  it('throws an error if not a positive number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--delay', '-8273']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --delay/)
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--delay', 'lorem-ipsum']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --delay/)
  })
})

describe('--throttle', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.throttle as number).toEqual(Infinity)
  })

  it('throws an error if not a positive number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--throttle', '-8273']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --throttle/)
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--throttle', 'lorem-ipsum']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --throttle/)
  })

  it('throws an error for zero', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--throttle', '0']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --throttle/)
  })
})

describe('--mode', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.mode).toBe('pass')
  })

  it('doesnt throw an error for a valid value', async () => {
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
      const result = await parseArgv(argv)
      expect(result.ok).toBe(true)
    }
  })

  it('throws an error for an invalid value', async () => {
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--mode',
      'lorem-ipsum',
    ]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --mode/)
  })
})

describe('--update', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.update).toBe('off')
  })

  it('doesnt throw an error for a valid value', async () => {
    const validValues = ['off', 'startup', 'only']

    for (const validValue of validValues) {
      const argv = ['', '', ...getRequiredArgs(), '--update', validValue]
      const result = await parseArgv(argv)
      expect(result.ok).toBe(true)
    }
  })

  it('throws an error for an invalid value', async () => {
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--update',
      'lorem-ipsum',
    ]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --update/)
  })
})

describe('--mocksDir', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.mocksDir).not.toBe(undefined)
  })

  it('doesnt throw an error for a valid value', async () => {
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--mocksDir',
      'src/',
    ]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
  })

  it('throws an error for an invalid folder', async () => {
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--mocksDir',
      'non-existing-folder',
    ]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --mocksDir/)
  })

  it('normalizes to an absolute path', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(path.isAbsolute(args.mocksDir)).toBe(true)
  })
})

describe('--logging', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.logging).toEqual(LOGGING_DEFAULT)
  })

  it('throws an error for invalid values', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--logging', 'lorem-ipsum']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --logging/)
  })

  it('accepts valid values', async () => {
    for (const validValue of LOGGING_VALID_VALUES) {
      const argv = ['', '', ...getRequiredArgs(), '--logging', validValue]
      const result = await parseArgv(argv)
      expect(result.ok).toBe(true)
    }
  })
})

describe('--mockKeys', () => {
  const validKeys = new Set(['url', 'method', 'body', 'headers'])

  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.mockKeys).toEqual(new Set(['url', 'method']))
  })

  it('throws an error for invalid values', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--mockKeys', 'lorem-ipsum']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --mockKeys/)
  })

  it('accepts valid combination', async () => {
    const validKeysArr = [...validKeys]

    function combine(
      cur: string[] = [],
      keys: string[] = [...validKeysArr],
      combinations: string[][] = [],
    ): string[][] {
      if (cur.length >= 4) {
        combinations.push([...cur])
        return combinations
      }

      for (let i = 0; i < keys.length; i += 1) {
        combine(
          [...cur, keys[i]],
          keys.filter((key) => key !== keys[i]),
          combinations,
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
      const result = await parseArgv(argv)
      expect(result.ok).toBe(true)
    }
  })
})

describe('--retries', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.retries).toEqual(RETRIES_DEFAULT)
  })

  it('accepts a positive integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--retries', '3']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value

    expect(args.retries as number).toBe(3)
  })

  it('throws an error if a negative integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--retries', '-8273']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --retries/)
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--retries', 'lorem-ipsum']
    const result = await parseArgv(argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/invalid --retries/)
  })
})

describe('--redactedHeaders', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.redactedHeaders).toEqual(REDACTED_HEADERS_DEFAULT)
  })

  it('parses value to an object', async () => {
    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      '{"example-token": null}',
    ]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.redactedHeaders).toEqual({
      'example-token': null,
    })
  })

  it('throws an error if not a valid JSON', async () => {
    // There is a final '}' missing to make it an invalid JSON
    const redactedHeaders1 = '{"content-type": "application/json"'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders1,
    ]
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(false)
    if (!result1.ok)
      expect(result1.error.message).toMatch(/invalid --redactedHeaders/)

    // undefined is not a valid JSON value
    const redactedHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders2,
    ]
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(false)
    if (!result2.ok)
      expect(result2.error.message).toMatch(/invalid --redactedHeaders/)
  })

  it('throws an error if not a valid Header type', async () => {
    // Invalid since it must be an object at the root level
    const redactedHeaders1 = '[1, 2, 3]'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders1,
    ]
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(false)
    if (!result1.ok)
      expect(result1.error.message).toMatch(/invalid --redactedHeaders/)

    // Invalid since it cannot have a depth larger than 2
    const redactedHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders2,
    ]
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(false)
    if (!result2.ok)
      expect(result2.error.message).toMatch(/invalid --redactedHeaders/)

    // Invalid since it has an array of numbers
    const redactedHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders3,
    ]
    const result3 = await parseArgv(argv3)
    expect(result3.ok).toBe(false)
    if (!result3.ok)
      expect(result3.error.message).toMatch(/invalid --redactedHeaders/)

    // Invalid since it has a number as key
    const redactedHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders4,
    ]
    const result4 = await parseArgv(argv4)
    expect(result4.ok).toBe(false)
    if (!result4.ok)
      expect(result4.error.message).toMatch(/invalid --redactedHeaders/)
  })
})

describe('--overwriteResponseHeaders', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.overwriteResponseHeaders).toEqual(
      OVERWRITE_RESPONSE_HEADERS_DEFAULT,
    )
  })

  it('parses value to an object', async () => {
    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      '{"content-type": "application/json", "host": "example.com"}',
    ]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.overwriteResponseHeaders).toEqual({
      'content-type': 'application/json',
      host: 'example.com',
    })
  })

  it('throws an error if not a valid JSON', async () => {
    // There is a final '}' missing to make it an invalid JSON
    const overwriteResponseHeaders1 = '{"content-type": "application/json"'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders1,
    ]
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(false)
    if (!result1.ok)
      expect(result1.error.message).toMatch(
        /invalid --overwriteResponseHeaders/,
      )

    // undefined is not a valid JSON value
    const overwriteResponseHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders2,
    ]
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(false)
    if (!result2.ok)
      expect(result2.error.message).toMatch(
        /invalid --overwriteResponseHeaders/,
      )
  })

  it('throws an error if not a valid Header type', async () => {
    // Invalid since it must be an object at the root level
    const overwriteResponseHeaders1 = '[1, 2, 3]'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders1,
    ]
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(false)
    if (!result1.ok)
      expect(result1.error.message).toMatch(
        /invalid --overwriteResponseHeaders/,
      )

    // Invalid since it cannot have a depth larger than 2
    const overwriteResponseHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders2,
    ]
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(false)
    if (!result2.ok)
      expect(result2.error.message).toMatch(
        /invalid --overwriteResponseHeaders/,
      )

    // Invalid since it has an array of numbers
    const overwriteResponseHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders3,
    ]
    const result3 = await parseArgv(argv3)
    expect(result3.ok).toBe(false)
    if (!result3.ok)
      expect(result3.error.message).toMatch(
        /invalid --overwriteResponseHeaders/,
      )

    // Invalid since it has a number as key
    const overwriteResponseHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders4,
    ]
    const result4 = await parseArgv(argv4)
    expect(result4.ok).toBe(false)
    if (!result4.ok)
      expect(result4.error.message).toMatch(
        /invalid --overwriteResponseHeaders/,
      )
  })
})

describe('--overwriteRequestHeaders', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.overwriteRequestHeaders).toEqual({ host: 'example.com' })
  })

  it('parses value to an object', async () => {
    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      '{"content-type": "application/json", "host": "example.com"}',
    ]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.overwriteRequestHeaders).toEqual({
      'content-type': 'application/json',
      host: 'example.com',
    })
  })

  it('throws an error if not a valid JSON', async () => {
    // There is a final '}' missing to make it an invalid JSON
    const overwriteRequestHeaders1 = '{"content-type": "application/json"'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders1,
    ]
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(false)
    if (!result1.ok)
      expect(result1.error.message).toMatch(/invalid --overwriteRequestHeaders/)

    // undefined is not a valid JSON value
    const overwriteRequestHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders2,
    ]
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(false)
    if (!result2.ok)
      expect(result2.error.message).toMatch(/invalid --overwriteRequestHeaders/)
  })

  it('throws an error if not a valid Header type', async () => {
    // Invalid since it must be an object at the root level
    const overwriteRequestHeaders1 = '[1, 2, 3]'
    const argv1 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders1,
    ]
    const result1 = await parseArgv(argv1)
    expect(result1.ok).toBe(false)
    if (!result1.ok)
      expect(result1.error.message).toMatch(/invalid --overwriteRequestHeaders/)

    // Invalid since it cannot have a depth larger than 2
    const overwriteRequestHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders2,
    ]
    const result2 = await parseArgv(argv2)
    expect(result2.ok).toBe(false)
    if (!result2.ok)
      expect(result2.error.message).toMatch(/invalid --overwriteRequestHeaders/)

    // Invalid since it has an array of numbers
    const overwriteRequestHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders3,
    ]
    const result3 = await parseArgv(argv3)
    expect(result3.ok).toBe(false)
    if (!result3.ok)
      expect(result3.error.message).toMatch(/invalid --overwriteRequestHeaders/)

    // Invalid since it has a number as key
    const overwriteRequestHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders4,
    ]
    const result4 = await parseArgv(argv4)
    expect(result4.ok).toBe(false)
    if (!result4.ok)
      expect(result4.error.message).toMatch(/invalid --overwriteRequestHeaders/)
  })
})

describe('--cors', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const result = await parseArgv(argv)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.cors).toEqual(CORS_DEFAULT)
  })

  it.each([
    ['t', true],
    ['y', true],
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('is casted to boolean %s', async (input, expected) => {
    const result = await parseArgv([
      '',
      '',
      ...getRequiredArgs(),
      '--cors',
      input as string,
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    const args = result.value
    expect(args.cors).toEqual(expected)
  })
})

describe('--rewritePath', () => {
  function argvWith(value: string): string[] {
    return ['', '', ...getRequiredArgs(), '--rewritePath', value]
  }

  async function parseRewritePathArgv(value: string[]) {
    const result = await parseArgv(value)
    expect(result.ok).toBe(true)
    if (!result.ok) throw result.error
    return result.value
  }

  it('receives an empty list if not set', async () => {
    const args = await parseRewritePathArgv(['', '', ...getRequiredArgs()])
    expect(args.rewritePath).toEqual([])
  })

  it('returns an empty list for an empty string', async () => {
    const args = await parseRewritePathArgv(argvWith(''))
    expect(args.rewritePath).toEqual([])
  })

  it('returns an empty list for a whitespace-only value', async () => {
    const args = await parseRewritePathArgv(argvWith('   '))
    expect(args.rewritePath).toEqual([])
  })

  it('parses a single rule', async () => {
    const args = await parseRewritePathArgv(argvWith('/api/graphql=>/graphql'))
    expect(args.rewritePath as readonly UnbrandedRewritePathRule[]).toEqual([
      { prefix: '/api/graphql', replacement: '/graphql' },
    ])
  })

  it('parses multiple comma-separated rules in order', async () => {
    const args = await parseRewritePathArgv(argvWith('/api/a=>/a,/api/b=>/b'))
    expect(args.rewritePath as readonly UnbrandedRewritePathRule[]).toEqual([
      { prefix: '/api/a', replacement: '/a' },
      { prefix: '/api/b', replacement: '/b' },
    ])
  })

  it('trims whitespace around prefix and replacement', async () => {
    const args = await parseRewritePathArgv(argvWith(' /api/a => /a '))
    expect(args.rewritePath as readonly UnbrandedRewritePathRule[]).toEqual([
      { prefix: '/api/a', replacement: '/a' },
    ])
  })

  it('tolerates a trailing comma', async () => {
    const args = await parseRewritePathArgv(argvWith('/api/a=>/a,'))
    expect(args.rewritePath as readonly UnbrandedRewritePathRule[]).toEqual([
      { prefix: '/api/a', replacement: '/a' },
    ])
  })

  it('tolerates blank fragments between commas', async () => {
    const args = await parseRewritePathArgv(argvWith('/api/a=>/a,,/api/b=>/b'))
    expect(args.rewritePath as readonly UnbrandedRewritePathRule[]).toEqual([
      { prefix: '/api/a', replacement: '/a' },
      { prefix: '/api/b', replacement: '/b' },
    ])
  })

  it('keeps a "=>" that appears inside the replacement', async () => {
    const args = await parseRewritePathArgv(argvWith('/api=>/v=>2'))
    expect(args.rewritePath as readonly UnbrandedRewritePathRule[]).toEqual([
      { prefix: '/api', replacement: '/v=>2' },
    ])
  })

  it('throws when the prefix is missing', async () => {
    const result = await parseArgv(argvWith('=>/graphql'))
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.message).toMatch(/invalid --rewritePath/)
  })

  it('throws when the replacement is empty', async () => {
    const result = await parseArgv(argvWith('/api=>'))
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.message).toMatch(/invalid --rewritePath/)
  })

  it('throws when the prefix is not an absolute path', async () => {
    const result = await parseArgv(argvWith('api=>/graphql'))
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.message).toMatch(/invalid --rewritePath/)
  })

  it('throws when the replacement is not an absolute path', async () => {
    const result = await parseArgv(argvWith('/api=>graphql'))
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.message).toMatch(/invalid --rewritePath/)
  })

  it('throws when the replacement is an absolute URL (host bypass)', async () => {
    const result = await parseArgv(argvWith('/api=>http://evil.example'))
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.message).toMatch(/invalid --rewritePath/)
  })

  it('throws when a rule has no "=>" separator', async () => {
    const result = await parseArgv(argvWith('/api/graphql'))
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.message).toMatch(/invalid --rewritePath/)
  })
})
