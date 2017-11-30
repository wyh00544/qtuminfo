const assert = require('assert')
const qtumscan = require('qtumscan-lib')
const Message = require('../message')
const {sanitizeStartStop} = require('../utils')
const {BufferReader, BufferWriter} = qtumscan.encoding

class GetblocksMessage extends Message {
  constructor(arg, options) {
    super('getblocks', options)
    this.version = options.protocolVersion
    arg = sanitizeStartStop(arg || {})
    this.starts = arg.starts
    this.stop = arg.stop
  }

  setPayload(payload) {
    let parser = new BufferReader(payload)
    this.version = parser.readUInt32LE()
    let startCount = parser.readVarintNum()
    this.starts = []
    for (let i = 0; i < startCount; ++i) {
      this.starts.push(parser.read(32))
    }
    this.stop = parser.read(32)
    Message.checkFinished(parser)
  }

  getPayload() {
    let bw = new BufferWriter()
    bw.writeUInt32LE(this.version)
    bw.writeVarintNum(this.starts.length)
    for (let start of this.starts) {
      bw.write(start)
    }
    if (this.stop.length !== 32) {
      throw new Error('Invalid hash length: ' + this.stop.length)
    }
    bw.write(this.stop)
    return bw.concat()
  }
}

module.exports = GetblocksMessage
