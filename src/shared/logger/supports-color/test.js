const supportsColor = require('.')

describe('supportsColor', () => {
  it('return true if `FORCE_COLOR` is in env', () => {
    expect.assertions(1)
    const env = { FORCE_COLOR: 'true' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return false if `FORCE_COLOR` is in env and is 0', () => {
    expect.assertions(1)
    const env = { FORCE_COLOR: '0' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(false)
  })

  it('return false if `FORCE_COLOR` is in env and is false', () => {
    expect.assertions(1)
    const env = { FORCE_COLOR: 'false' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(false)
  })

  it('return true if `FORCE_COLOR` is in env and is 1', () => {
    expect.assertions(1)
    const env = { FORCE_COLOR: '1' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return false if not TTY', () => {
    expect.assertions(1)
    const stream = { isTTY: false }
    const env = { FOO: 'bar' }
    expect(supportsColor({ env, stream })).toBe(false)
  })

  it('return true if `COLORTERM` is in env', () => {
    expect.assertions(1)
    const env = { COLORTERM: 'true' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return false if `CI` is in env', () => {
    expect.assertions(1)
    const env = { CI: 'APPVEYOR' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(false)
  })

  it('return true if `TRAVIS` is in env', () => {
    expect.assertions(1)
    const env = { CI: 'Travis', TRAVIS: '1' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return true if `CIRCLECI` is in env', () => {
    expect.assertions(1)
    const env = { CI: 'true', CIRCLECI: 'true' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return true if `APPVEYOR` is in env', () => {
    expect.assertions(1)
    const env = { CI: 'true', APPVEYOR: 'true' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return true if `GITLAB_CI` is in env', () => {
    expect.assertions(1)
    const env = { CI: 'true', GITLAB_CI: 'true' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return true if `BUILDKITE` is in env', () => {
    expect.assertions(1)
    const env = { CI: 'true', BUILDKITE: 'true' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return true if `DRONE` is in env', () => {
    expect.assertions(1)
    const env = { CI: 'true', DRONE: 'true' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return true if Codeship is in env', () => {
    expect.assertions(1)
    const env = { CI: 'true', CI_NAME: 'codeship' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('return false if `TEAMCITY_VERSION` is in env and is < 9.1', () => {
    expect.assertions(1)
    const env = { TEAMCITY_VERSION: '9.0.5 (build 32523)' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(false)
  })

  it('support screen-256color', () => {
    expect.assertions(1)
    const env = { TERM: 'screen-256color' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })

  it('support putty-256color', () => {
    expect.assertions(1)
    const env = { TERM: 'putty-256color' }
    const stream = { isTTY: true }
    expect(supportsColor({ env, stream })).toBe(true)
  })
})
