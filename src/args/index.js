/** @typedef {import('./types').Args} Args */
/** @typedef {import('../shared/http').Headers} Headers */
/** @typedef {Map<string, string>} ArgvMap */

const cluster = require('node:cluster')
const path = require('path')
const { promises: fs } = require('fs')
const stringToBoolean = require('../shared/string-to-boolean')
const Logger = require('../shared/logger')
const { prettifyError } = require('../shared/logger/pretty-error')
const { bold, stringify } = require('../shared/logger/format')
const getConstructorName = require('../shared/get-constructor-name')
const isPortTaken = require('../shared/is-port-taken')

const logger = new Logger()

/** @type {Readonly<string[]>} */
const MODE_VALID_VALUES = [
  'read',
  'write',
  'read-write',
  'pass-through',
  'pass',
  'read-pass',
  'pass-read',
]

/** @type {Readonly<string[]>} */
const UPDATE_VALID_VALUES = ['off', 'startup', 'only']
/** @type {Readonly<string[]>} */
const MOCK_KEYS_VALID_VALUES = ['url', 'method', 'headers', 'body']
const LOGGING_VALID_VALUES = Logger.validLevels

/** @type {Readonly<RegExp>} */
const MOCK_KEYS_BODY_REGEX = /^body(?:\.[A-Za-z0-9\-_]+)*$/

/** @type {Args['mode']} */
const MODE_DEFAULT = 'pass'
/** @type {Args['update']} */
const UPDATE_DEFAULT = 'off'
const MOCK_KEYS_DEFAULT = new Set(['method', 'url'])
const PORT_DEFAULT = 8273
const DELAY_DEFAULT = 0
const THROTTLE_DEFAULT = Infinity
const WORKERS_DEFAULT = 1
const CACHE_DEFAULT = false
const LOGGING_DEFAULT = 'verbose'
/** @type {Args['redactedHeaders']} */
const REDACTED_HEADERS_DEFAULT = {}
const RETRIES_DEFAULT = 0
/** @type {Args['overwriteResponseHeaders']} */
const OVERWRITE_RESPONSE_HEADERS_DEFAULT = {}
/** @type {Args['overwriteRequestHeaders']} */
const OVERWRITE_REQUEST_HEADERS_DEFAULT = {}
const CORS_DEFAULT = false

/**
 * @param {string} logging
 * @returns {boolean}
 */
function shouldWarnDeprecation(logging) {
  // Type definition for cluster module is broken
  // @ts-expect-error
  return cluster.isPrimary && (logging === 'warn' || logging === 'verbose')
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
    '--folder',
    '--cache',
    '--logging',
    '--mockKeys',
    '--redactedHeaders',
    '--retries',
    '--overwriteResponseHeaders',
    '--overwriteRequestHeaders',
    '--cors',
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
  const logging = argvMap.get('logging') ?? LOGGING_DEFAULT

  if (mode === 'pass-through') {
    mode = 'pass'

    if (shouldWarnDeprecation(logging)) {
      const originalForceLog = logger.forceLog
      logger.forceLog = true
      logger.warn(
        `Argument ${bold(`--mode pass-through`)} was renamed to ${bold(
          `--mode pass`
        )}\n     Deprecation #002: https://github.com/nytimes/mocker/blob/main/docs/deprecations.md#002`
      )
      logger.forceLog = originalForceLog
    }
  }

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
 * @returns {Args['redactedHeaders']}
 */
function getRedactedHeaders(argvMap) {
  const redactedHeadersArgv = argvMap.get('redactedHeaders')

  try {
    const redactedHeaders =
      redactedHeadersArgv === undefined
        ? REDACTED_HEADERS_DEFAULT
        : JSON.parse(redactedHeadersArgv)
    const customTypeError = new TypeError(`invalid --redactedHeaders`)
    validateHeadersType(redactedHeaders, customTypeError)

    return redactedHeaders
  } catch (error) {
    // Error from JSON.parse()
    if (error instanceof SyntaxError) {
      throw prettifyError({
        error: new TypeError('invalid --redactedHeaders'),
        expected: `valid JSON string`,
        received: stringify(redactedHeadersArgv),
      })
    } else {
      throw error
    }
  }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['retries']}
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

  return retries
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['overwriteResponseHeaders']}
 */
function getOverwriteResponseHeaders(argvMap) {
  const overwriteResponseHeadersArgv = argvMap.get('overwriteResponseHeaders')
  try {
    const overwriteResponseHeaders =
      overwriteResponseHeadersArgv === undefined
        ? OVERWRITE_RESPONSE_HEADERS_DEFAULT
        : JSON.parse(overwriteResponseHeadersArgv)

    const customTypeError = new TypeError(`invalid --overwriteResponseHeaders`)
    validateHeadersType(overwriteResponseHeaders, customTypeError)

    return overwriteResponseHeaders
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw prettifyError({
        error: new TypeError('invalid --overwriteResponseHeaders'),
        expected: `valid JSON string`,
        received: stringify(overwriteResponseHeadersArgv),
      })
    } else {
      throw error
    }
  }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['overwriteRequestHeaders']}
 */
function getOverwriteRequestHeaders(argvMap) {
  const overwriteRequestHeadersArgv = argvMap.get('overwriteRequestHeaders')
  try {
    const overwriteRequestHeaders =
      overwriteRequestHeadersArgv === undefined
        ? OVERWRITE_RESPONSE_HEADERS_DEFAULT
        : JSON.parse(overwriteRequestHeadersArgv)

    const customTypeError = new TypeError(`invalid --overwriteRequestHeaders`)
    validateHeadersType(overwriteRequestHeaders, customTypeError)

    return overwriteRequestHeaders
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw prettifyError({
        error: new TypeError('invalid --overwriteRequestHeaders'),
        expected: `valid JSON string`,
        received: stringify(overwriteRequestHeadersArgv),
      })
    } else {
      throw error
    }
  }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Promise<Args['port']>}
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

  return port
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['origin']}
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

  return origin
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['delay']}
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

  return delay
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['throttle']}
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

  return throttle
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Promise<Args['responsesDir']>}
 */
async function getResponsesDir(argvMap) {
  const logging = argvMap.get('logging') ?? LOGGING_DEFAULT
  const folder = argvMap.get('folder') ?? ''
  const responsesDir = argvMap.get('responsesDir') ?? ''
  const normalizedResponsesDir = responsesDir ? responsesDir : folder
  const error = prettifyError({
    error: new TypeError(`invalid --responsesDir`),
    expected: `a valid folder path`,
    received: stringify(normalizedResponsesDir),
  })

  if (folder && shouldWarnDeprecation(logging)) {
    const originalForceLog = logger.forceLog
    logger.forceLog = true
    logger.warn(
      `Argument ${bold(`--folder`)} was renamed to ${bold(
        `--responsesDir`
      )}\n     Deprecation #001: https://github.com/nytimes/mocker/blob/main/docs/deprecations.md`
    )
    logger.forceLog = originalForceLog
  }

  if (normalizedResponsesDir === '') {
    throw error
  }

  const resolvedPath = path.resolve(normalizedResponsesDir)

  try {
    await fs.access(responsesDir || folder)
  } catch (_) {
    throw error
  }

  return resolvedPath
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['workers']}
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

  return workers
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['cache']}
 */
function getCache(argvMap) {
  const logging = argvMap.get('logging') ?? LOGGING_DEFAULT
  const cache = stringToBoolean(argvMap.get('cache') ?? `${CACHE_DEFAULT}`)

  if (cache === true && shouldWarnDeprecation(logging)) {
    const originalForceLog = logger.forceLog
    logger.forceLog = true
    logger.warn(
      `Argument ${bold(
        `--cache`
      )} was removed\n     Deprecation #003: https://github.com/nytimes/mocker/blob/main/docs/deprecations.md`
    )
    logger.forceLog = originalForceLog
  }

  return CACHE_DEFAULT
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
  const argvLogging = argvMap.get('logging') ?? LOGGING_DEFAULT
  const logging = argvLogging ?? LOGGING_DEFAULT

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
 * @param {Headers} headers
 * @param {TypeError} customTypeError
 * @returns {void}
 */
function validateHeadersType(headers, customTypeError) {
  const prettyError = prettifyError({
    error: customTypeError,
    expected: `valid Header type { [header: string]: string[] | string | number | null | undefined }`,
    received: stringify(headers),
  })

  // Must be an object at the root level
  if (getConstructorName(headers) !== 'Object') {
    throw prettyError
  }

  for (const value of Object.values(headers)) {
    const valueConstructorName = getConstructorName(value)
    if (
      valueConstructorName === 'String' ||
      valueConstructorName === 'Number' ||
      valueConstructorName === 'Undefined' ||
      valueConstructorName === 'Null' ||
      valueConstructorName === 'Boolean'
    ) {
      continue
    } else if (valueConstructorName === 'Array') {
      // To make TypeScript happy
      if (!Array.isArray(value)) {
        continue
      }

      value.forEach(
        /** @param {any} arrValue */ (arrValue) => {
          if (getConstructorName(arrValue) !== 'String') {
            throw prettyError
          }
        }
      )
      continue
    }

    throw prettyError
  }
}

/**
 * @param {ArgvMap} argvMap
 * @returns {Args['cache']}
 */
function getCors(argvMap) {
  const cors = stringToBoolean(argvMap.get('cors') ?? `${CORS_DEFAULT}`)

  return cors
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
  Logger.level = logging

  const port = await getPort(argvMap)
  const mode = getMode(argvMap)
  const update = getUpdate(argvMap)
  const origin = getOrigin(argvMap)
  const delay = getDelay(argvMap)
  const throttle = getThrottle(argvMap)
  const responsesDir = await getResponsesDir(argvMap)
  const workers = getWorkers(argvMap)
  const cache = getCache(argvMap)
  const mockKeys = getMockKeys(argvMap)
  const retries = getRetries(argvMap)
  const redactedHeaders = getRedactedHeaders(argvMap)
  const overwriteResponseHeaders = getOverwriteResponseHeaders(argvMap)
  const overwriteRequestHeaders = getOverwriteRequestHeaders(argvMap)
  const cors = getCors(argvMap)

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
    cache,
    logging,
    mockKeys,
    redactedHeaders,
    retries,
    overwriteResponseHeaders,
    overwriteRequestHeaders,
    cors,
  }

  return args
}

module.exports = {
  parseArgv,
  PORT_DEFAULT,
  DELAY_DEFAULT,
  MODE_DEFAULT,
  UPDATE_DEFAULT,
  THROTTLE_DEFAULT,
  WORKERS_DEFAULT,
  CACHE_DEFAULT,
  LOGGING_DEFAULT,
  MOCK_KEYS_DEFAULT,
  MODE_VALID_VALUES,
  UPDATE_VALID_VALUES,
  MOCK_KEYS_VALID_VALUES,
  REDACTED_HEADERS_DEFAULT,
  RETRIES_DEFAULT,
  LOGGING_VALID_VALUES,
  OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  OVERWRITE_REQUEST_HEADERS_DEFAULT,
  CORS_DEFAULT,
}
