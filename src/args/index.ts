import type { Headers } from '../shared/http/index.js'
import type { Result } from '../shared/types.js'
import type {
  AbsoluteDirPath,
  Args,
  HttpPort,
  HttpUrl,
  Milliseconds,
  NonNegativeInteger,
  RewritePathRule,
  ThrottleValue,
} from './types.js'

type ArgvMap = Map<string, string>

import { parse as parseAbsoluteDirPath } from '../shared/absolute-dir-path/index.js'
import { parse as parseAbsolutePath } from '../shared/absolute-path/index.js'
import { parseHeaders } from '../shared/http/index.js'
import { parse as parseHttpPort } from '../shared/http-port/index.js'
import { parse as parseHttpUrl } from '../shared/http-url/index.js'
import isPortTaken from '../shared/is-port-taken/index.js'
import { stringify } from '../shared/logger/format/index.js'
import {
  validLevels as loggerValidLevels,
  setLevel as setLoggerLevel,
} from '../shared/logger/index.js'
import { prettifyError } from '../shared/logger/pretty-error/index.js'
import { parse as parseMilliseconds } from '../shared/milliseconds/index.js'
import { parse as parseNonNegativeInteger } from '../shared/non-negative-integer/index.js'
import stringToBoolean from '../shared/string-to-boolean/index.js'
import { parse as parseThrottleValue } from '../shared/throttle-value/index.js'
import { tryCatch } from '../shared/try-catch/index.js'

const MODE = {
  READ: 'read',
  WRITE: 'write',
  READ_WRITE: 'read-write',
  PASS: 'pass',
  READ_PASS: 'read-pass',
  PASS_READ: 'pass-read',
} as const satisfies Record<string, Args['mode']>

const MODE_VALID_VALUES: Readonly<string[]> = Object.values(MODE)

const UPDATE_VALID_VALUES: Readonly<string[]> = ['off', 'startup', 'only']
const MOCK_KEYS_VALID_VALUES: Readonly<string[]> = [
  'url',
  'method',
  'headers',
  'body',
]
const LOGGING_VALID_VALUES = loggerValidLevels

const MOCK_KEYS_BODY_REGEX: Readonly<RegExp> = /^body(?:\.[A-Za-z0-9\-_]+)*$/

const MOCKS_DIR_DEFAULT = '.'
const MODE_DEFAULT: Args['mode'] = MODE.PASS
const UPDATE_DEFAULT: Args['update'] = 'off'
const MOCK_KEYS_DEFAULT = new Set(['method', 'url'])
const PORT_DEFAULT = 8273 as HttpPort
const DELAY_DEFAULT = 0 as Milliseconds
const THROTTLE_DEFAULT = Infinity as ThrottleValue
const LOGGING_DEFAULT = 'verbose'
const REDACTED_HEADERS_DEFAULT: Args['redactedHeaders'] = {}
const RETRIES_DEFAULT = 0 as NonNegativeInteger
const OVERWRITE_RESPONSE_HEADERS_DEFAULT: Args['overwriteResponseHeaders'] = {}
const CORS_DEFAULT = false

const PROXY_DEFAULT = ''

const REWRITE_PATH_DEFAULT = ''

function getDefaultOverwriteRequestHeaders(argvMap: ArgvMap) {
  const argvOrigin = argvMap.get('origin') || ''
  const result = tryCatch(() => new URL(argvOrigin))

  if (!result.ok) {
    return {} as Headers
  }

  return {
    host: result.value.host,
  }
}

function validateArgvShape(argv: string[]): Result<undefined> {
  const invalidShapeError = prettifyError({
    error: new TypeError('args has invalid shape'),
    expected: 'args following the pattern "--arg1 value1 --arg2 value2"',
    received: stringify(argv.slice(3).join(' ')),
  })

  if (argv.length % 2 !== 0) {
    return { ok: false, error: invalidShapeError }
  }

  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i].indexOf('--') !== 0 || argv[i + 1].indexOf('--') === 0) {
      return { ok: false, error: invalidShapeError }
    }
  }

  return { ok: true, value: undefined }
}

function validateArgvKeys(argv: string[]): Result<undefined> {
  const validKeys = [
    '--origin',
    '--port',
    '--delay',
    '--throttle',
    '--update',
    '--mode',
    '--mocksDir',
    '--logging',
    '--mockKeys',
    '--redactedHeaders',
    '--retries',
    '--overwriteResponseHeaders',
    '--overwriteRequestHeaders',
    '--cors',
    '--proxy',
    '--rewritePath',
  ]

  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]

    if (!validKeys.includes(key)) {
      return {
        ok: false,
        error: prettifyError({
          error: new TypeError(`invalid arg`),
          expected: `one of ${stringify(validKeys)}`,
          received: stringify(key),
        }),
      }
    }
  }

  return { ok: true, value: undefined }
}

function argvToArgvMap(argv: string[]): ArgvMap {
  const argvMap: ArgvMap = new Map()

  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].substring(2)
    const val = argv[i + 1]
    argvMap.set(key, val)
  }

  return argvMap
}

/** Build the standard prettified `invalid --<arg>` error used by every getter. */
function invalidArgError(
  argName: string,
  {
    expected,
    received,
    hint,
  }: { expected: string; received: string; hint?: string },
): Error {
  return prettifyError({
    error: new TypeError(`invalid --${argName}`),
    expected,
    received,
    hint,
  })
}

function getMode(argvMap: ArgvMap): Result<Args['mode']> {
  const mode = argvMap.get('mode') ?? MODE_DEFAULT
  if (!MODE_VALID_VALUES.includes(mode)) {
    return {
      ok: false,
      error: invalidArgError('mode', {
        expected: `one of ${stringify(MODE_VALID_VALUES)}`,
        received: stringify(mode),
      }),
    }
  }
  return { ok: true, value: mode as Args['mode'] }
}

function getUpdate(argvMap: ArgvMap): Result<Args['update']> {
  const argvUpdate = argvMap.get('update')
  const update = argvUpdate === undefined ? UPDATE_DEFAULT : argvUpdate
  if (!UPDATE_VALID_VALUES.includes(update)) {
    return {
      ok: false,
      error: invalidArgError('update', {
        expected: `one of ${stringify(UPDATE_VALID_VALUES)}`,
        received: stringify(argvUpdate),
      }),
    }
  }
  return { ok: true, value: update as Args['update'] }
}

function parseMockKeys(mockKeys: Set<string>): Result<Args['mockKeys']> {
  for (const mockKey of mockKeys) {
    if (
      !MOCK_KEYS_VALID_VALUES.includes(mockKey) &&
      !MOCK_KEYS_BODY_REGEX.test(mockKey)
    ) {
      return { ok: false, error: new TypeError('invalid --mockKeys') }
    }
  }
  return { ok: true, value: mockKeys as Args['mockKeys'] }
}

function getMockKeys(argvMap: ArgvMap): Result<Args['mockKeys']> {
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
    return {
      ok: false,
      error: invalidArgError('mockKeys', {
        expected: `set of ${stringify(MOCK_KEYS_VALID_VALUES)}`,
        received: stringify(mockKeysArgv),
        hint: `The body deep attributes can be used too, e.g.: "body.foo.bar"`,
      }),
    }
  }

  return { ok: true, value: result.value }
}

function getJsonHeadersArg(
  argvMap: ArgvMap,
  argName: string,
  defaultValue: Headers,
): Result<Headers> {
  const argvValue = argvMap.get(argName)

  const parseResult = tryCatch(() =>
    argvValue === undefined ? defaultValue : JSON.parse(argvValue),
  )

  if (!parseResult.ok) {
    return {
      ok: false,
      error: invalidArgError(argName, {
        expected: `valid JSON string`,
        received: stringify(argvValue),
      }),
    }
  }

  const headersResult = parseHeaders(parseResult.value)
  if (!headersResult.ok) {
    return {
      ok: false,
      error: invalidArgError(argName, {
        expected: `valid Header type { [header: string]: string[] | string | number | null | undefined }`,
        received: stringify(parseResult.value),
      }),
    }
  }

  return { ok: true, value: headersResult.value }
}

function getRedactedHeaders(argvMap: ArgvMap): Result<Args['redactedHeaders']> {
  return getJsonHeadersArg(argvMap, 'redactedHeaders', REDACTED_HEADERS_DEFAULT)
}

function getRetries(argvMap: ArgvMap): Result<NonNegativeInteger> {
  const retriesArgv = argvMap.get('retries') ?? String(RETRIES_DEFAULT)
  const result = parseNonNegativeInteger(retriesArgv)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('retries', {
        expected: `non-negative integer`,
        received: stringify(retriesArgv),
      }),
    }
  }

  return { ok: true, value: result.value }
}

function getOverwriteResponseHeaders(
  argvMap: ArgvMap,
): Result<Args['overwriteResponseHeaders']> {
  return getJsonHeadersArg(
    argvMap,
    'overwriteResponseHeaders',
    OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  )
}

function getOverwriteRequestHeaders(
  argvMap: ArgvMap,
): Result<Args['overwriteRequestHeaders']> {
  return getJsonHeadersArg(
    argvMap,
    'overwriteRequestHeaders',
    getDefaultOverwriteRequestHeaders(argvMap),
  )
}

async function getPort(argvMap: ArgvMap): Promise<Result<HttpPort>> {
  const portArgv = argvMap.get('port') ?? String(PORT_DEFAULT)
  const result = parseHttpPort(portArgv)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('port', {
        expected: `positive integer`,
        received: stringify(portArgv),
      }),
    }
  }

  if (await isPortTaken(result.value)) {
    return {
      ok: false,
      error: invalidArgError('port', {
        expected: `available port on host`,
        received: stringify(result.value),
      }),
    }
  }

  return { ok: true, value: result.value }
}

function getOrigin(argvMap: ArgvMap, mode: string): Result<HttpUrl> {
  const originArgv = argvMap.get('origin') ?? ''

  if (originArgv === '' && mode === MODE.READ) {
    return { ok: true, value: 'http://localhost' as HttpUrl }
  }

  const result = parseHttpUrl(originArgv)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('origin', {
        expected: `valid URL with HTTP or HTTPS protocol`,
        received: stringify(originArgv),
      }),
    }
  }

  return { ok: true, value: result.value }
}

function getDelay(argvMap: ArgvMap): Result<Milliseconds> {
  const argvDelay = argvMap.get('delay') ?? String(DELAY_DEFAULT)
  const result = parseMilliseconds(argvDelay)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('delay', {
        expected: `non-negative integer in milliseconds (max 3600000)`,
        received: stringify(argvDelay),
      }),
    }
  }

  return { ok: true, value: result.value }
}

function getThrottle(argvMap: ArgvMap): Result<ThrottleValue> {
  const argvThrottle = argvMap.get('throttle') ?? 'Infinity'
  const result = parseThrottleValue(argvThrottle)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('throttle', {
        expected: `positive integer or Infinity`,
        received: stringify(argvThrottle),
      }),
    }
  }

  return { ok: true, value: result.value }
}

async function getMocksDir(argvMap: ArgvMap): Promise<Result<AbsoluteDirPath>> {
  const mocksDir = argvMap.get('mocksDir') ?? MOCKS_DIR_DEFAULT
  const result = await parseAbsoluteDirPath(mocksDir)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('mocksDir', {
        expected: `a valid folder path`,
        received: stringify(mocksDir),
      }),
    }
  }

  return { ok: true, value: result.value }
}

function getLogging(argvMap: ArgvMap): Result<Args['logging']> {
  const logging = argvMap.get('logging') ?? LOGGING_DEFAULT
  if (!LOGGING_VALID_VALUES.includes(logging as Args['logging'])) {
    return {
      ok: false,
      error: invalidArgError('logging', {
        expected: `one of ${stringify(LOGGING_VALID_VALUES)}`,
        received: stringify(logging),
      }),
    }
  }
  return { ok: true, value: logging as Args['logging'] }
}

function getCors(argvMap: ArgvMap): Result<Args['cors']> {
  const cors = stringToBoolean(argvMap.get('cors') ?? `${CORS_DEFAULT}`)

  return { ok: true, value: cors }
}

function getProxy(argvMap: ArgvMap): Result<HttpUrl | ''> {
  const proxy = argvMap.get('proxy') ?? PROXY_DEFAULT

  if (proxy === '') {
    return { ok: true, value: '' }
  }

  const result = parseHttpUrl(proxy)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('proxy', {
        expected: `valid HTTP or HTTPS URL`,
        received: stringify(proxy),
      }),
    }
  }

  return { ok: true, value: result.value }
}

/**
 * Parse comma-separated `prefix=>replacement` rules into an ordered list.
 * Mirrors the --mockKeys comma convention. First matching rule wins at request
 * time (see applyRewritePath in src/origin/rewrite-path.js).
 *
 * Both prefix and replacement must be absolute paths (start with `/`). This
 * keeps the rewrite a path-only transform: an absolute-URL replacement would
 * otherwise be forwarded as-is by the origin layer, silently bypassing
 * --origin.
 */
function parseRewritePath(
  rewritePathArgv: string,
): Result<Args['rewritePath']> {
  const rules: RewritePathRule[] = []

  for (const rule of rewritePathArgv.split(',')) {
    const trimmedRule = rule.trim()

    // Tolerate blank fragments (trailing/leading commas, whitespace-only).
    if (trimmedRule === '') {
      continue
    }

    // Split on the first `=>` only so a replacement may itself contain `=>`.
    const separatorIndex = trimmedRule.indexOf('=>')
    const prefixResult = parseAbsolutePath(
      separatorIndex === -1 ? '' : trimmedRule.slice(0, separatorIndex).trim(),
    )
    const replacementResult = parseAbsolutePath(
      separatorIndex === -1 ? '' : trimmedRule.slice(separatorIndex + 2).trim(),
    )

    if (!prefixResult.ok || !replacementResult.ok) {
      return { ok: false, error: new TypeError('invalid --rewritePath') }
    }

    rules.push({
      prefix: prefixResult.value,
      replacement: replacementResult.value,
    })
  }

  return { ok: true, value: rules }
}

function getRewritePath(argvMap: ArgvMap): Result<Args['rewritePath']> {
  const rewritePathArgv = argvMap.get('rewritePath') ?? REWRITE_PATH_DEFAULT
  const result = parseRewritePath(rewritePathArgv)

  if (!result.ok) {
    return {
      ok: false,
      error: invalidArgError('rewritePath', {
        expected: `rules as "prefix=>replacement[,prefix=>replacement]" where prefix and replacement are absolute paths`,
        received: stringify(rewritePathArgv),
      }),
    }
  }

  return { ok: true, value: result.value }
}

async function parseArgv(argv: string[]): Promise<Result<Args>> {
  const shapeResult = validateArgvShape(argv)
  if (!shapeResult.ok) {
    return shapeResult
  }

  const keysResult = validateArgvKeys(argv)
  if (!keysResult.ok) {
    return keysResult
  }

  const argvMap = argvToArgvMap(argv)

  const loggingResult = getLogging(argvMap)
  if (!loggingResult.ok) {
    return loggingResult
  }
  const logging = loggingResult.value
  setLoggerLevel(logging)

  const portResult = await getPort(argvMap)
  if (!portResult.ok) {
    return portResult
  }
  const port = portResult.value

  const modeResult = getMode(argvMap)
  if (!modeResult.ok) {
    return modeResult
  }
  const mode = modeResult.value

  const updateResult = getUpdate(argvMap)
  if (!updateResult.ok) {
    return updateResult
  }
  const update = updateResult.value

  const originResult = getOrigin(argvMap, mode)
  if (!originResult.ok) {
    return originResult
  }
  const origin = originResult.value

  const delayResult = getDelay(argvMap)
  if (!delayResult.ok) {
    return delayResult
  }
  const delay = delayResult.value

  const throttleResult = getThrottle(argvMap)
  if (!throttleResult.ok) {
    return throttleResult
  }
  const throttle = throttleResult.value

  const mocksDirResult = await getMocksDir(argvMap)
  if (!mocksDirResult.ok) {
    return mocksDirResult
  }
  const mocksDir = mocksDirResult.value

  const mockKeysResult = getMockKeys(argvMap)
  if (!mockKeysResult.ok) {
    return mockKeysResult
  }
  const mockKeys = mockKeysResult.value

  const retriesResult = getRetries(argvMap)
  if (!retriesResult.ok) {
    return retriesResult
  }
  const retries = retriesResult.value

  const redactedHeadersResult = getRedactedHeaders(argvMap)
  if (!redactedHeadersResult.ok) {
    return redactedHeadersResult
  }
  const redactedHeaders = redactedHeadersResult.value

  const overwriteResponseHeadersResult = getOverwriteResponseHeaders(argvMap)
  if (!overwriteResponseHeadersResult.ok) {
    return overwriteResponseHeadersResult
  }
  const overwriteResponseHeaders = overwriteResponseHeadersResult.value

  const overwriteRequestHeadersResult = getOverwriteRequestHeaders(argvMap)
  if (!overwriteRequestHeadersResult.ok) {
    return overwriteRequestHeadersResult
  }
  const overwriteRequestHeaders = overwriteRequestHeadersResult.value

  const corsResult = getCors(argvMap)
  if (!corsResult.ok) {
    return corsResult
  }
  const cors = corsResult.value

  const proxyResult = getProxy(argvMap)
  if (!proxyResult.ok) {
    return proxyResult
  }
  const proxy = proxyResult.value

  const rewritePathResult = getRewritePath(argvMap)
  if (!rewritePathResult.ok) {
    return rewritePathResult
  }
  const rewritePath = rewritePathResult.value

  const args: Args = {
    port,
    mode,
    update,
    origin,
    delay,
    throttle,
    mocksDir,
    logging,
    mockKeys,
    redactedHeaders,
    retries,
    overwriteResponseHeaders,
    overwriteRequestHeaders,
    cors,
    proxy,
    rewritePath,
  }

  return { ok: true, value: args }
}

export {
  CORS_DEFAULT,
  DELAY_DEFAULT,
  LOGGING_DEFAULT,
  LOGGING_VALID_VALUES,
  MOCK_KEYS_DEFAULT,
  MOCK_KEYS_VALID_VALUES,
  MOCKS_DIR_DEFAULT,
  MODE,
  MODE_DEFAULT,
  MODE_VALID_VALUES,
  OVERWRITE_RESPONSE_HEADERS_DEFAULT,
  PORT_DEFAULT,
  PROXY_DEFAULT,
  parseArgv,
  REDACTED_HEADERS_DEFAULT,
  RETRIES_DEFAULT,
  REWRITE_PATH_DEFAULT,
  THROTTLE_DEFAULT,
  UPDATE_DEFAULT,
  UPDATE_VALID_VALUES,
}
