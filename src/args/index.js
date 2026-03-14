/** @typedef {import('./types.js').Args} Args */
/** @template T @template {Error} [E=Error] @typedef {import('../shared/types.js').Result<T, E>} Result */
/** @typedef {import('./types.js').HttpUrl} HttpUrl */
/** @typedef {import('./types.js').AbsoluteDirPath} AbsoluteDirPath */
/** @typedef {import('./types.js').NonNegativeInteger} NonNegativeInteger */
/** @typedef {import('./types.js').HttpPort} HttpPort */
/** @typedef {import('./types.js').ThrottleValue} ThrottleValue */
/** @typedef {import('../shared/http/types.js').Headers} Headers */
/** @typedef {Map<string, string>} ArgvMap */

import stringToBoolean from '../shared/string-to-boolean/index.js'
import {
  validLevels as loggerValidLevels,
  setLevel as setLoggerLevel,
} from '../shared/logger/index.js'
import { prettifyError } from '../shared/logger/pretty-error/index.js'
import { stringify } from '../shared/logger/format/index.js'
import isPortTaken from '../shared/is-port-taken/index.js'
import { tryCatch } from '../shared/try-catch/index.js'
import { parseHeaders } from '../shared/http/index.js'
import { parse as parseHttpUrl } from '../shared/http-url/index.js'
import { parse as parseNonNegativeInteger } from '../shared/non-negative-integer/index.js'
import { parse as parseThrottleValue } from '../shared/throttle-value/index.js'
import { parse as parseAbsoluteDirPath } from '../shared/absolute-dir-path/index.js'
import { parse as parseHttpPort } from '../shared/http-port/index.js'

const MODE = /** @satisfies {Record<string, Args['mode']>} */ (/** @type {const} */ ({
  READ: 'read',
  WRITE: 'write',
  READ_WRITE: 'read-write',
  PASS: 'pass',
  READ_PASS: 'read-pass',
  PASS_READ: 'pass-read',
}))

/** @type {Readonly<string[]>} */
const MODE_VALID_VALUES = Object.values(MODE)

/** @type {Readonly<string[]>} */
const UPDATE_VALID_VALUES = ['off', 'startup', 'only']
/** @type {Readonly<string[]>} */
const MOCK_KEYS_VALID_VALUES = ['url', 'method', 'headers', 'body']
const LOGGING_VALID_VALUES = loggerValidLevels

/** @type {Readonly<RegExp>} */
const MOCK_KEYS_BODY_REGEX = /^body(?:\.[A-Za-z0-9\-_]+)*$/

const RESPONSES_DIR_DEFAULT = '.'
/** @type {Args['mode']} */
const MODE_DEFAULT = MODE.PASS
/** @type {Args['update']} */
const UPDATE_DEFAULT = 'off'
const MOCK_KEYS_DEFAULT = new Set(['method', 'url'])
const PORT_DEFAULT = 8273
const DELAY_DEFAULT = 0
const THROTTLE_DEFAULT = Infinity
const WORKERS_DEFAULT = 1
const LOGGING_DEFAULT = 'verbose'
/** @type {Args['redactedHeaders']} */
const REDACTED_HEADERS_DEFAULT = {}
const RETRIES_DEFAULT = 0
/** @type {Args['overwriteResponseHeaders']} */
const OVERWRITE_RESPONSE_HEADERS_DEFAULT = {}
const CORS_DEFAULT = false

const PROXY_DEFAULT = /** @type {HttpUrl} */ ('')

/**
 * @param {ArgvMap} argvMap
 */
function getDefaultOverwriteRequestHeaders(argvMap) {
  const argvOrigin = argvMap.get('origin') || ''
  const { host } = new URL(argvOrigin)

  return {
    host,
  }
}

/**
 * @param {string[]} argv
 * @returns {void}
 */
function validateArgvShape(argv) {
  const invalidShapeError = prettifyError({
    error: new TypeError('args has invalid shape'),
    expected: 'args following the pattern "--arg1 value1 --arg2 value2"',
    received: stringify(argv.slice(3).join(' ')),
  })

  if (argv.length % 2 !== 0) {
    throw invalidShapeError
  }

  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i].indexOf('--') !== 0 || argv[i + 1].indexOf('--') === 0) {
      throw invalidShapeError
    }
  }
}

/**
 * @param {string[]} argv
 * @returns {void}
 */
function validateArgvKeys(argv) {
  const validKeys = [
    '--origin',
    '--port',
    '--delay',
    '--throttle',
    '--update',
    '--mode',
    '--workers',
    '--responsesDir',
    '--logging',
    '--mockKeys',
    '--redactedHeaders',
    '--retries',
    '--overwriteResponseHeaders',
    '--overwriteRequestHeaders',
    '--cors',
    '--proxy',
  ]

  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]

    if (!validKeys.includes(key)) {
      throw prettifyError({
        error: new TypeError(`invalid arg`),
        expected: `one of ${stringify(validKeys)}`,
        received: stringify(key),
      })
    }
  }
}

/**
 * @param {string[]} argv
 * @returns {ArgvMap}
 */
function argvToArgvMap(argv) {
  /** @type {ArgvMap} */
  const argvMap = new Map()

  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].substring(2)
    const val = argv[i + 1]
    argvMap.set(key, val)
  }

  return argvMap
}

/**
 * @param {string} mode
 * @returns {Result<Args['mode']>}
 */
function parseMode(mode) {
  if (!MODE_VALID_VALUES.includes(mode)) {
    return { ok: false, error: new TypeError(`invalid --mode`) }
  }
  return { ok: true, value: /** @type {Args['mode']} */ (mode) }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['mode']}
 */
function getMode(argvMap) {
  const mode = argvMap.get('mode') ?? MODE_DEFAULT
  const result = parseMode(mode)
  if (!result.ok) {
    throw prettifyError({
      error: new TypeError('invalid --mode'),
      expected: `one of ${stringify(MODE_VALID_VALUES)}`,
      received: `${stringify(mode)}`,
    })
  }
  return result.value
}

/**
 * @param {string} update
 * @returns {Result<Args['update']>}
 */
function parseUpdate(update) {
  if (!UPDATE_VALID_VALUES.includes(update)) {
    return { ok: false, error: new TypeError('invalid --update') }
  }
  return { ok: true, value: /** @type {Args['update']} */ (update) }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['update']}
 */
function getUpdate(argvMap) {
  const argvUpdate = argvMap.get('update')
  const update = argvUpdate === undefined ? UPDATE_DEFAULT : argvUpdate
  const result = parseUpdate(update)
  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --update`),
      expected: `one of ${stringify(UPDATE_VALID_VALUES)}`,
      received: stringify(argvUpdate),
    })
  }
  return result.value
}

/**
 * @param {Set<string>} mockKeys
 * @returns {Result<Args['mockKeys']>}
 */
function parseMockKeys(mockKeys) {
  for (const mockKey of mockKeys) {
    if (!MOCK_KEYS_VALID_VALUES.includes(mockKey) && !MOCK_KEYS_BODY_REGEX.test(mockKey)) {
      return { ok: false, error: new TypeError('invalid --mockKeys') }
    }
  }
  return { ok: true, value: /** @type {Args['mockKeys']} */ (mockKeys) }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['mockKeys']}
 */
function getMockKeys(argvMap) {
  const mockKeys = new Set(MOCK_KEYS_DEFAULT)
  const mockKeysArgv = argvMap.get('mockKeys')

  if (mockKeysArgv) {
    mockKeys.clear()
    for (const mockKey of mockKeysArgv.split(',')) {
      mockKeys.add(mockKey.trim())
    }
  }

  const result = parseMockKeys(mockKeys)
  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --mockKeys`),
      expected: `set of ${stringify(MOCK_KEYS_VALID_VALUES)}`,
      received: stringify(mockKeysArgv),
      hint: `The body deep attributes can be used too, e.g.: "body.foo.bar"`,
    })
  }

  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @param {string} argName
 * @param {Headers} defaultValue
 * @returns {Headers}
 */
function getJsonHeadersArg(argvMap, argName, defaultValue) {
  const argvValue = argvMap.get(argName)

  const parseResult = tryCatch(() =>
    argvValue === undefined ? defaultValue : JSON.parse(argvValue),
  )

  if (!parseResult.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --${argName}`),
      expected: `valid JSON string`,
      received: stringify(argvValue),
    })
  }

  const headersResult = parseHeaders(parseResult.value)
  if (!headersResult.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --${argName}`),
      expected: `valid Header type { [header: string]: string[] | string | number | null | undefined }`,
      received: stringify(parseResult.value),
    })
  }

  return headersResult.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['redactedHeaders']}
 */
function getRedactedHeaders(argvMap) {
  return getJsonHeadersArg(argvMap, 'redactedHeaders', REDACTED_HEADERS_DEFAULT)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {NonNegativeInteger}
 */
function getRetries(argvMap) {
  const retriesArgv = argvMap.get('retries') ?? String(RETRIES_DEFAULT)
  const result = parseNonNegativeInteger(retriesArgv)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --retries`),
      expected: `positive integer`,
      received: stringify(retriesArgv),
    })
  }

  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['overwriteResponseHeaders']}
 */
function getOverwriteResponseHeaders(argvMap) {
  return getJsonHeadersArg(
    argvMap,
    'overwriteResponseHeaders',
    OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  )
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['overwriteRequestHeaders']}
 */
function getOverwriteRequestHeaders(argvMap) {
  return getJsonHeadersArg(
    argvMap,
    'overwriteRequestHeaders',
    getDefaultOverwriteRequestHeaders(argvMap),
  )
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Promise<HttpPort>}
 */
async function getPort(argvMap) {
  const portArgv = argvMap.get('port') ?? String(PORT_DEFAULT)
  const result = parseHttpPort(portArgv)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --port`),
      expected: `positive integer`,
      received: stringify(portArgv),
    })
  }

  if (await isPortTaken(result.value)) {
    throw prettifyError({
      error: new TypeError(`invalid --port`),
      expected: `available port on host`,
      received: stringify(result.value),
    })
  }

  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {HttpUrl}
 */
function getOrigin(argvMap) {
  const originArgv = argvMap.get('origin') ?? ''
  const result = parseHttpUrl(originArgv)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --origin`),
      expected: `valid URL with HTTP or HTTPS protocol`,
      received: stringify(originArgv),
    })
  }

  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {NonNegativeInteger}
 */
function getDelay(argvMap) {
  const argvDelay = argvMap.get('delay') ?? String(DELAY_DEFAULT)
  const result = parseNonNegativeInteger(argvDelay)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --delay`),
      expected: `positive integer`,
      received: stringify(argvDelay),
    })
  }

  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {ThrottleValue}
 */
function getThrottle(argvMap) {
  const argvThrottle = argvMap.get('throttle') ?? 'Infinity'
  const result = parseThrottleValue(argvThrottle)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --throttle`),
      expected: `positive integer`,
      received: stringify(argvThrottle),
    })
  }

  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Promise<AbsoluteDirPath>}
 */
async function getResponsesDir(argvMap) {
  const responsesDir = argvMap.get('responsesDir') ?? RESPONSES_DIR_DEFAULT
  const result = await parseAbsoluteDirPath(responsesDir)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --responsesDir`),
      expected: `a valid folder path`,
      received: stringify(responsesDir),
    })
  }

  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {NonNegativeInteger}
 */
function getWorkers(argvMap) {
  const argvWorkers = argvMap.get('workers') ?? String(WORKERS_DEFAULT)
  const result = parseNonNegativeInteger(argvWorkers)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --workers`),
      expected: `positive integer`,
      received: stringify(argvWorkers),
    })
  }

  return result.value
}

/**
 * @param {string} logging
 * @returns {Result<Args['logging']>}
 */
function parseLogging(logging) {
  if (!LOGGING_VALID_VALUES.includes(/** @type {Args['logging']} */ (logging))) {
    return { ok: false, error: new TypeError('invalid --logging') }
  }
  return { ok: true, value: /** @type {Args['logging']} */ (logging) }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['logging']}
 */
function getLogging(argvMap) {
  const logging = argvMap.get('logging') ?? LOGGING_DEFAULT
  const result = parseLogging(logging)
  if (!result.ok) {
    const error = prettifyError({
      error: new TypeError(`invalid --logging`),
      expected: `one of ${stringify(LOGGING_VALID_VALUES)}`,
      received: stringify(logging),
    })
    throw error
  }
  return result.value
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['cors']}
 */
function getCors(argvMap) {
  const cors = stringToBoolean(argvMap.get('cors') ?? `${CORS_DEFAULT}`)

  return cors
}

/**
 * @param {ArgvMap} argvMap
 * @returns {HttpUrl}
 */
function getProxy(argvMap) {
  const proxy = argvMap.get('proxy') ?? PROXY_DEFAULT

  if (proxy === '') {
    return /** @type {HttpUrl} */ (proxy)
  }

  const result = parseHttpUrl(proxy)

  if (!result.ok) {
    throw prettifyError({
      error: new TypeError(`invalid --proxy`),
      expected: `valid HTTP or HTTPS URL`,
      received: stringify(proxy),
    })
  }

  return result.value
}

/**
 * @param {string[]} argv
 * @returns {Promise<Args>}
 */
async function parseArgv(argv) {
  validateArgvShape(argv)
  validateArgvKeys(argv)

  const argvMap = argvToArgvMap(argv)

  const logging = getLogging(argvMap)
  setLoggerLevel(logging)

  const port = await getPort(argvMap)
  const mode = getMode(argvMap)
  const update = getUpdate(argvMap)
  const origin = getOrigin(argvMap)
  const delay = getDelay(argvMap)
  const throttle = getThrottle(argvMap)
  const responsesDir = await getResponsesDir(argvMap)
  const workers = getWorkers(argvMap)
  const mockKeys = getMockKeys(argvMap)
  const retries = getRetries(argvMap)
  const redactedHeaders = getRedactedHeaders(argvMap)
  const overwriteResponseHeaders = getOverwriteResponseHeaders(argvMap)
  const overwriteRequestHeaders = getOverwriteRequestHeaders(argvMap)
  const cors = getCors(argvMap)
  const proxy = getProxy(argvMap)

  /** @type {Args} */
  const args = {
    port,
    mode,
    update,
    origin,
    delay,
    throttle,
    responsesDir,
    workers,
    logging,
    mockKeys,
    redactedHeaders,
    retries,
    overwriteResponseHeaders,
    overwriteRequestHeaders,
    cors,
    proxy,
  }

  return args
}

export {
  parseArgv,
  MODE,
  RESPONSES_DIR_DEFAULT,
  PORT_DEFAULT,
  DELAY_DEFAULT,
  MODE_DEFAULT,
  UPDATE_DEFAULT,
  THROTTLE_DEFAULT,
  WORKERS_DEFAULT,
  LOGGING_DEFAULT,
  MOCK_KEYS_DEFAULT,
  MODE_VALID_VALUES,
  UPDATE_VALID_VALUES,
  MOCK_KEYS_VALID_VALUES,
  REDACTED_HEADERS_DEFAULT,
  RETRIES_DEFAULT,
  LOGGING_VALID_VALUES,
  OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  CORS_DEFAULT,
  PROXY_DEFAULT,
}
