// Inspired on https://raw.githubusercontent.com/chalk/supports-color/master/index.js

/**
 * @param {Object} options
 * @param {Object<string, string | undefined>} [options.env]
 * @param {{ isTTY: boolean }} [options.stream]
 * @returns {boolean}
 */
// eslint-disable-next-line complexity
function supportsColor({ env = process.env, stream = process.stdout } = {}) {
  if ('FORCE_COLOR' in env) {
    if (env.FORCE_COLOR === 'false' || env.FORCE_COLOR === '0') {
      return false
    } else {
      return true
    }
  }

  if (env.TERM === 'dumb') {
    return false
  }

  if (process.platform === 'win32') {
    return true
  }

  if ('CI' in env) {
    if (
      [
        'TRAVIS',
        'CIRCLECI',
        'APPVEYOR',
        'GITLAB_CI',
        'GITHUB_ACTIONS',
        'BUILDKITE',
        'DRONE',
      ].some((sign) => sign in env) ||
      env.CI_NAME === 'codeship'
    ) {
      return true
    }

    return false
  }

  if ('TEAMCITY_VERSION' in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION || '')
  }

  if (env.COLORTERM === 'truecolor') {
    return true
  }

  if ('TERM_PROGRAM' in env) {
    switch (env.TERM_PROGRAM) {
      case 'iTerm.app':
        return true
      case 'Apple_Terminal':
        return true
      // No default
    }
  }

  if (/-256(color)?$/i.test(env.TERM || '')) {
    return true
  }

  if (
    /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(
      env.TERM || ''
    )
  ) {
    return true
  }

  if ('COLORTERM' in env) {
    return true
  }

  if (!stream.isTTY) {
    return false
  }

  return false
}

module.exports = supportsColor
