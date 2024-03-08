/** @typedef {import('./types').cloneProps} cloneProps */
/** @typedef {import('./types').Tee} Tee */
/** @typedef {import('./types').HttpServerResponse} HttpServerResponse */

const { PassThrough, pipeline } = require('stream')
const Logger = require('../../logger')

const logger = new Logger()

/** @type {cloneProps} */
function cloneProps(source, target) {
  for (const property of Object.keys(source)) {
    if (property in target) {
      continue
    }

    target[property] = source[property]
  }

  // `headers` prop is non-enumerable, so we make sure to explicitly copy it to `target`
  target.headers = source.headers

  return target
}

/**
 * Returs `numOfConnections` streams that uses `stream` as input. Also clones
 * all properties from `stream` to all connections.
 *
 * @type {Tee}
 * @returns {PassThrough[]}
 */
function tee(stream, numOfConnections = 2) {
  const teeStreams = []
  for (let i = 0; i < numOfConnections; i += 1) {
    // Setting `highWaterMark` as high as possible so `teeStream1` can consume
    // `stream` to the end without having to wait for `teeStream2`.
    let teeStream = new PassThrough({ highWaterMark: Number.MAX_SAFE_INTEGER })
    teeStream = cloneProps(stream, teeStream)
    pipeline(stream, teeStream, (error) => {
      if (error) {
        logger.error('error teeing stream', error)
      }
    })
    teeStreams.push(teeStream)
  }

  return teeStreams
}

module.exports = tee
