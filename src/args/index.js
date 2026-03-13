/** @typedef {import('./types.js').Args} Args */
/** @typedef {import('./types.js').HttpUrl} HttpUrl */
/** @typedef {import('./types.js').AbsoluteDirPath} AbsoluteDirPath */
/** @typedef {import('./types.js').NonNegativeInteger} NonNegativeInteger */
/** @typedef {import('./types.js').HttpPort} HttpPort */
/** @typedef {import('./types.js').ThrottleValue} ThrottleValue */
/** @typedef {import('../shared/http/types.js').Headers} Headers */
/** @typedef {Map<string, string>} ArgvMap */

import path from 'node:path'
import { promises as fs } from 'node:fs'
import stringToBoolean from '../shared/string-to-boolean/index.js'
import {
  validLevels as loggerValidLevels,
  setLevel as setLoggerLevel,
} from '../shared/logger/index.js'
import { prettifyError } from '../shared/logger/pretty-error/index.js'
import { stringify } from '../shared/logger/format/index.js'
import isPortTaken from '../shared/is-port-taken/index.js'
import { isHeaders } from '../shared/http/index.js'

const MODE = /** @type {const} */ ({
  READ: 'read',
  WRITE: 'write',
  READ_WRITE: 'read-write',
  PASS: 'pass',
  READ_PASS: 'read-pass',
  PASS_READ: 'pass-read',
})

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
 * @returns {mode is Args["mode"]}
 */
function isArgsMode(mode) {
  return MODE_VALID_VALUES.includes(mode)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['mode']}
 */
function getMode(argvMap) {
  let mode = argvMap.get('mode') ?? MODE_DEFAULT

  if (!isArgsMode(mode)) {
    throw prettifyError({
      error: TypeError(`invalid --mode`),
      expected: `one of ${stringify(MODE_VALID_VALUES)}`,
      received: `${stringify(mode)}`,
    })
  }

  return mode
}

/**
 * @param {string} update
 * @returns {update is Args["update"]}
 */
function isArgsUpdate(update) {
  return UPDATE_VALID_VALUES.includes(update)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['update']}
 */
function getUpdate(argvMap) {
  const argvUpdate = argvMap.get('update')
  const update = argvUpdate === undefined ? UPDATE_DEFAULT : argvUpdate

  if (!isArgsUpdate(update)) {
    throw prettifyError({
      error: new TypeError(`invalid --update`),
      expected: `one of ${stringify(UPDATE_VALID_VALUES)}`,
      received: stringify(argvUpdate),
    })
  }

  return update
}

/**
 * @param {Set<string>} mockKeys
 * @returns {mockKeys is Args["mockKeys"]}
 */
function isArgsMockKeys(mockKeys) {
  for (const mockKey of mockKeys) {
    if (
      !MOCK_KEYS_VALID_VALUES.includes(mockKey) &&
      !MOCK_KEYS_BODY_REGEX.test(mockKey)
    ) {
      return false
    }
  }

  return true
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

  if (!isArgsMockKeys(mockKeys)) {
    throw prettifyError({
      error: new TypeError(`invalid --mockKeys`),
      expected: `set of ${stringify(MOCK_KEYS_VALID_VALUES)}`,
      received: stringify(mockKeysArgv),
      hint: `The body deep attributes can be used too, e.g.: "body.foo.bar"`,
    })
  }

  return mockKeys
}

/**
 * @param {ArgvMap} argvMap
 * @param {string} argName
 * @param {Headers} defaultValue
 * @returns {Headers}
 */
function getJsonHeadersArg(argvMap, argName, defaultValue) {
  const argvValue = argvMap.get(argName)

  try {
    const headers =
      argvValue === undefined ? defaultValue : JSON.parse(argvValue)
    if (!isHeaders(headers)) {
      throw prettifyError({
        error: new TypeError(`invalid --${argName}`),
        expected: `valid Header type { [header: string]: string[] | string | number | null | undefined }`,
        received: stringify(headers),
      })
    }

    return headers
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw prettifyError({
        error: new TypeError(`invalid --${argName}`),
        expected: `valid JSON string`,
        received: stringify(argvValue),
      })
    } else {
      throw error
    }
  }
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
  const retriesArgv = argvMap.get('retries')
  const retries =
    retriesArgv === undefined
      ? RETRIES_DEFAULT
      : Number.parseInt(retriesArgv, 10)
  const expected = `positive integer`

  if (!Number.isInteger(retries) || retries < 0) {
    throw prettifyError({
      error: new TypeError(`invalid --retries`),
      expected,
      received: stringify(retriesArgv),
    })
  }

  return /** @type {NonNegativeInteger} */ (retries)
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
  const portArgv = argvMap.get('port')
  const port =
    portArgv === undefined ? PORT_DEFAULT : Number.parseInt(portArgv, 10)
  const expected = `positive integer`

  if (!Number.isInteger(port) || port < 0) {
    throw prettifyError({
      error: new TypeError(`invalid --port`),
      expected,
      received: stringify(portArgv),
    })
  }

  if (await isPortTaken(port)) {
    throw prettifyError({
      error: new TypeError(`invalid --port`),
      expected: `available port on host`,
      received: stringify(port),
    })
  }

  return /** @type {HttpPort} */ (port)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {HttpUrl}
 */
function getOrigin(argvMap) {
  const originArgv = argvMap.get('origin')
  const origin = originArgv === undefined ? '' : originArgv

  let urlObj

  try {
    urlObj = new URL(origin)
  } catch (_) {
    throw prettifyError({
      error: new TypeError(`invalid --origin`),
      expected: `valid URL`,
      received: stringify(origin),
    })
  }

  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw prettifyError({
      error: new TypeError(`invalid --origin`),
      expected: `URL with HTTP or HTTPS protocol`,
      received: stringify(origin),
    })
  }

  return /** @type {HttpUrl} */ (origin)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {NonNegativeInteger}
 */
function getDelay(argvMap) {
  const argvDelay = argvMap.get('delay')
  const delay =
    argvDelay === undefined ? DELAY_DEFAULT : Number.parseInt(argvDelay, 10)
  const expected = 'positive integer'

  if (!Number.isInteger(delay) || delay < 0) {
    throw prettifyError({
      error: new TypeError(`invalid --delay`),
      expected,
      received: stringify(argvDelay),
    })
  }

  return /** @type {NonNegativeInteger} */ (delay)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {ThrottleValue}
 */
function getThrottle(argvMap) {
  const argvThrottle = argvMap.get('throttle')
  const throttle = argvThrottle
    ? Number.parseInt(argvThrottle, 10)
    : THROTTLE_DEFAULT
  const expected = 'positive integer'

  if ((!Number.isInteger(throttle) && throttle !== Infinity) || throttle < 0) {
    throw prettifyError({
      error: new TypeError(`invalid --throttle`),
      expected,
      received: stringify(argvThrottle),
    })
  }

  return /** @type {ThrottleValue} */ (throttle)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Promise<AbsoluteDirPath>}
 */
async function getResponsesDir(argvMap) {
  const responsesDir = argvMap.get('responsesDir') ?? RESPONSES_DIR_DEFAULT
  const error = prettifyError({
    error: new TypeError(`invalid --responsesDir`),
    expected: `a valid folder path`,
    received: stringify(responsesDir),
  })

  if (responsesDir === '') {
    throw error
  }

  const resolvedPath = path.resolve(responsesDir)

  try {
    await fs.access(responsesDir)
  } catch (_) {
    throw error
  }

  return /** @type {AbsoluteDirPath} */ (resolvedPath)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {NonNegativeInteger}
 */
function getWorkers(argvMap) {
  const argvWorkers = argvMap.get('workers')
  const workers =
    argvWorkers === undefined
      ? WORKERS_DEFAULT
      : Number.parseInt(argvWorkers, 10)
  const expected = 'positive integer'

  if (!Number.isInteger(workers) || workers < 0) {
    throw prettifyError({
      error: new TypeError(`invalid --workers`),
      expected,
      received: stringify(argvWorkers),
    })
  }

  return /** @type {NonNegativeInteger} */ (workers)
}

/**
 * @param {string} logging
 * @returns {logging is Args["logging"]}
 */
function isArgsLogging(logging) {
  // @ts-ignore
  return LOGGING_VALID_VALUES.includes(logging)
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['logging']}
 */
function getLogging(argvMap) {
  const logging = argvMap.get('logging') ?? LOGGING_DEFAULT

  if (!isArgsLogging(logging)) {
    const error = prettifyError({
      error: new TypeError(`invalid --logging`),
      expected: `one of ${stringify(LOGGING_VALID_VALUES)}`,
      received: stringify(logging),
    })
    throw error
  }

  return logging
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

  let url
  try {
    url = new URL(proxy)
  } catch {
    throw prettifyError({
      error: new TypeError(`invalid --proxy`),
      expected: `valid HTTP or HTTPS URL`,
      received: stringify(proxy),
    })
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw prettifyError({
      error: new TypeError(`invalid --proxy`),
      expected: `URL with HTTP or HTTPS protocol`,
      received: stringify(proxy),
    })
  }

  return /** @type {HttpUrl} */ (proxy)
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
