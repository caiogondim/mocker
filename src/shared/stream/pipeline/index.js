const stream = require('stream')
const { promisify } = require('util')

const pipeline = promisify(stream.pipeline)

module.exports = pipeline
