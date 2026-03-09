import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  parseArgv,
  PORT_DEFAULT,
  RETRIES_DEFAULT,
  LOGGING_DEFAULT,
  LOGGING_VALID_VALUES,
  OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  REDACTED_HEADERS_DEFAULT,
  CORS_DEFAULT,
} from './index.js'

function getRequiredArgs() {
  return ['--origin', 'https://example.com']
}

describe('behavior', () => {
  it('throws an error if argv has an invalid arg', async () => {
    const argv1 = ['', '', ...getRequiredArgs()]
    await parseArgv(argv1)

    const argv2 = ['', '', ...getRequiredArgs(), '--foo', 'bar']
    await assert.rejects(parseArgv(argv2), (err) => {
      assert.match(err.message, /invalid arg/)
      return true
    })
  })

  it('throws an error if argv doesnt respect the `--key value` pattern', async () => {
    const argv1 = ['', '', '--origin', 'http://example.com', '--delay']
    await assert.rejects(parseArgv(argv1), (err) => {
      assert.match(err.message, /args has invalid shape/)
      return true
    })

    const argv2 = ['', '', ...getRequiredArgs(), '--delay', '100']
    await parseArgv(argv2)

    const argv3 = [
      '',
      '',
      '--origin',
      'http://example.com',
      '--delay',
      '--origin',
    ]
    await assert.rejects(parseArgv(argv3), (err) => {
      assert.match(err.message, /args has invalid shape/)
      return true
    })
  })
})

describe('--origin', () => {
  it('throws an error if not set', async () => {
    const argv = ['', '', '--port', '8273']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --origin/)
      return true
    })
  })

  it('throws an error if not a valid URL', async () => {
    const argv = ['', '', '--origin', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --origin/)
      return true
    })
  })

  it('throws an error if protocol is not http: or https:', async () => {
    const argv = ['', '', '--origin', 'lorem://ipsum.com']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --origin/)
      return true
    })
  })
})

describe('--port', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.deepStrictEqual(args.port, PORT_DEFAULT)
  })

  it('throws an error if not a positive number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--port', '-8273']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --port/)
      return true
    })
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--port', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --port/)
      return true
    })
  })

  it('throws an error if port is already in use', async () => {
    // Given I have a port already in use — bind an actual port
    const net = await import('node:net')
    const server = net.default.createServer()
    await new Promise((resolve) => server.listen(0, () => resolve(undefined)))
    const takenPort = /** @type {import('node:net').AddressInfo} */ (
      server.address()
    ).port

    // When I call `parserArgv` passing a `--port` that is already in use
    const argv = ['', '', ...getRequiredArgs(), '--port', `${takenPort}`]

    try {
      // Then it should throw an error
      await assert.rejects(parseArgv(argv), /invalid --port/)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

describe('--delay', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.strictEqual(args.delay, 0)
  })

  it('throws an error if not a positive number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--delay', '-8273']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --delay/)
      return true
    })
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--delay', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --delay/)
      return true
    })
  })
})

describe('--throttle', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    assert.deepStrictEqual(args.throttle, Infinity)
  })

  it('throws an error if not a positive number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--throttle', '-8273']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --throttle/)
      return true
    })
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--throttle', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --throttle/)
      return true
    })
  })
})

describe('--mode', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.strictEqual(args.mode, 'pass')
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
      await parseArgv(argv)
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
    // @ts-ignore
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --mode/)
      return true
    })
  })
})

describe('--update', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.strictEqual(args.update, 'off')
  })

  it('doesnt throw an error for a valid value', async () => {
    const validValues = ['off', 'startup', 'only']

    for (const validValue of validValues) {
      const argv = ['', '', ...getRequiredArgs(), '--update', validValue]
      await parseArgv(argv)
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
    // @ts-ignore
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --update/)
      return true
    })
  })
})

describe('--workers', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.strictEqual(args.workers, 1)
  })

  it('throws an error if not a positive number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--workers', '-6']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --workers/)
      return true
    })
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--workers', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --workers/)
      return true
    })
  })

  it('is always a positive Number', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--workers', '123']
    const args = await parseArgv(argv)

    assert.strictEqual(typeof args.workers, 'number')
    assert.ok(args.workers > 0)
  })
})

describe('--responsesDir', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.notStrictEqual(args.responsesDir, undefined)
  })

  it('doesnt throw an error for a valid value', async () => {
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--responsesDir',
      'src/',
    ]
    await parseArgv(argv)
  })

  it('throws an error for an invalid folder', async () => {
    const argv = [
      '',
      '',
      '--origin',
      'https://example.com',
      '--responsesDir',
      'non-existing-folder',
    ]
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --responsesDir/)
      return true
    })
  })

  it('normalizes to an absolute path', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.strictEqual(path.isAbsolute(args.responsesDir), true)
  })
})

describe('--logging', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.deepStrictEqual(args.logging, LOGGING_DEFAULT)
  })

  it('throws an error for invalid values', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--logging', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --logging/)
      return true
    })
  })

  it('accepts valid values', async () => {
    for (const validValue of LOGGING_VALID_VALUES) {
      const argv = ['', '', ...getRequiredArgs(), '--logging', validValue]
      await parseArgv(argv)
    }
  })
})

describe('--mockKeys', () => {
  const validKeys = new Set(['url', 'method', 'body', 'headers'])

  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.deepStrictEqual(args.mockKeys, new Set(['url', 'method']))
  })

  it('throws an error for invalid values', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--mockKeys', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --mockKeys/)
      return true
    })
  })

  it('accepts valid combination', async () => {
    const validKeysArr = [...validKeys]

    /**
     * @param {string[]} cur
     * @param {string[]} keys
     * @param {string[][]} combinations
     * @returns {string[][]}
     */
    function combine(cur = [], keys = [...validKeysArr], combinations = []) {
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
      await parseArgv(argv)
    }
  })
})

describe('--retries', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)

    assert.deepStrictEqual(args.retries, RETRIES_DEFAULT)
  })

  it('accepts a positive integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--retries', '3']
    const args = await parseArgv(argv)

    assert.strictEqual(args.retries, 3)
  })

  it('throws an error if a negative integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--retries', '-8273']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --retries/)
      return true
    })
  })

  it('throws an error if not an integer', async () => {
    const argv = ['', '', ...getRequiredArgs(), '--retries', 'lorem-ipsum']
    await assert.rejects(parseArgv(argv), (err) => {
      assert.match(err.message, /invalid --retries/)
      return true
    })
  })
})

describe('--redactedHeaders', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    assert.deepStrictEqual(args.redactedHeaders, REDACTED_HEADERS_DEFAULT)
  })

  it('parses value to an object', async () => {
    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      '{"example-token": null}',
    ]
    const args = await parseArgv(argv)
    assert.deepStrictEqual(args.redactedHeaders, {
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
    await assert.rejects(parseArgv(argv1), (err) => {
      assert.match(err.message, /invalid --redactedHeaders/)
      return true
    })

    // undefined is not a valid JSON value
    const redactedHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders2,
    ]
    await assert.rejects(parseArgv(argv2), (err) => {
      assert.match(err.message, /invalid --redactedHeaders/)
      return true
    })
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
    await assert.rejects(parseArgv(argv1), (err) => {
      assert.match(err.message, /invalid --redactedHeaders/)
      return true
    })

    // Invalid since it cannot have a depth larger than 2
    const redactedHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders2,
    ]
    await assert.rejects(parseArgv(argv2), (err) => {
      assert.match(err.message, /invalid --redactedHeaders/)
      return true
    })

    // Invalid since it has an array of numbers
    const redactedHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders3,
    ]
    await assert.rejects(parseArgv(argv3), (err) => {
      assert.match(err.message, /invalid --redactedHeaders/)
      return true
    })

    // Invalid since it has a number as key
    const redactedHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--redactedHeaders',
      redactedHeaders4,
    ]
    await assert.rejects(parseArgv(argv4), (err) => {
      assert.match(err.message, /invalid --redactedHeaders/)
      return true
    })
  })
})

describe('--overwriteResponseHeaders', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    assert.deepStrictEqual(
      args.overwriteResponseHeaders,
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
    const args = await parseArgv(argv)
    assert.deepStrictEqual(args.overwriteResponseHeaders, {
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
    await assert.rejects(parseArgv(argv1), (err) => {
      assert.match(err.message, /invalid --overwriteResponseHeaders/)
      return true
    })

    // undefined is not a valid JSON value
    const overwriteResponseHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders2,
    ]
    await assert.rejects(parseArgv(argv2), (err) => {
      assert.match(err.message, /invalid --overwriteResponseHeaders/)
      return true
    })
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
    await assert.rejects(parseArgv(argv1), (err) => {
      assert.match(err.message, /invalid --overwriteResponseHeaders/)
      return true
    })

    // Invalid since it cannot have a depth larger than 2
    const overwriteResponseHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders2,
    ]
    await assert.rejects(parseArgv(argv2), (err) => {
      assert.match(err.message, /invalid --overwriteResponseHeaders/)
      return true
    })

    // Invalid since it has an array of numbers
    const overwriteResponseHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders3,
    ]
    await assert.rejects(parseArgv(argv3), (err) => {
      assert.match(err.message, /invalid --overwriteResponseHeaders/)
      return true
    })

    // Invalid since it has a number as key
    const overwriteResponseHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteResponseHeaders',
      overwriteResponseHeaders4,
    ]
    await assert.rejects(parseArgv(argv4), (err) => {
      assert.match(err.message, /invalid --overwriteResponseHeaders/)
      return true
    })
  })
})

describe('--overwriteRequestHeaders', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    assert.deepStrictEqual(args.overwriteRequestHeaders, { host: 'example.com' })
  })

  it('parses value to an object', async () => {
    const argv = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      '{"content-type": "application/json", "host": "example.com"}',
    ]
    const args = await parseArgv(argv)
    assert.deepStrictEqual(args.overwriteRequestHeaders, {
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
    await assert.rejects(parseArgv(argv1), (err) => {
      assert.match(err.message, /invalid --overwriteRequestHeaders/)
      return true
    })

    // undefined is not a valid JSON value
    const overwriteRequestHeaders2 = '{"content-type": undefined }'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders2,
    ]
    await assert.rejects(parseArgv(argv2), (err) => {
      assert.match(err.message, /invalid --overwriteRequestHeaders/)
      return true
    })
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
    await assert.rejects(parseArgv(argv1), (err) => {
      assert.match(err.message, /invalid --overwriteRequestHeaders/)
      return true
    })

    // Invalid since it cannot have a depth larger than 2
    const overwriteRequestHeaders2 = '{"lorem": { "ipsum": "dolor" }}'
    const argv2 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders2,
    ]
    await assert.rejects(parseArgv(argv2), (err) => {
      assert.match(err.message, /invalid --overwriteRequestHeaders/)
      return true
    })

    // Invalid since it has an array of numbers
    const overwriteRequestHeaders3 = '{"lorem": [1, 2, 3]}'
    const argv3 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders3,
    ]
    await assert.rejects(parseArgv(argv3), (err) => {
      assert.match(err.message, /invalid --overwriteRequestHeaders/)
      return true
    })

    // Invalid since it has a number as key
    const overwriteRequestHeaders4 = '{1: "lorem"}'
    const argv4 = [
      '',
      '',
      ...getRequiredArgs(),
      '--overwriteRequestHeaders',
      overwriteRequestHeaders4,
    ]
    await assert.rejects(parseArgv(argv4), (err) => {
      assert.match(err.message, /invalid --overwriteRequestHeaders/)
      return true
    })
  })
})

describe('--cors', () => {
  it('receives a default value if not set', async () => {
    const argv = ['', '', ...getRequiredArgs()]
    const args = await parseArgv(argv)
    assert.deepStrictEqual(args.cors, CORS_DEFAULT)
  })

  for (const [input, expected] of [
    ['t', true],
    ['y', true],
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ]) {
    it(`is casted to boolean ${input}`, async () => {
      const args = await parseArgv([
        '',
        '',
        ...getRequiredArgs(),
        '--cors',
        input,
      ])
      assert.deepStrictEqual(args.cors, expected)
    })
  }
})
