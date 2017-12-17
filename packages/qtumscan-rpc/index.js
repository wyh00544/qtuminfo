const http = require('http')
const https = require('https')

const cl = console.log.bind(console)
function noop() {}

class RpcClient {
  constructor({
    host = '127.0.0.1',
    port = 3889,
    user = 'user',
    pass = 'pass',
    protocol,
    disableAgent = false,
    rejectUnauthorized = true
  } = {}) {
    this.host = host
    this.port = port
    this.user = user
    this.pass = pass
    this.protocol = protocol === 'http' ? http : https
    this.batchedCalls = null
    this.disableAgent = disableAgent
    this.rejectUnauthorized = rejectUnauthorized
    this.log = RpcClient.config.log || RpcClient.loggers[RpcClient.config.logger || 'normal']
  }

  rpc(request) {
    request = JSON.stringify(request)
    let auth = Buffer.from(this.user + ':' + this.pass).toString('base64')
    let option = {
      host: this.host,
      port: this.port,
      method: 'POST',
      path: '/',
      rejectUnauthorized: this.rejectUnauthorized,
      agent: this.disableAgent ? false : undefined
    }
    if (this.httpOptions) {
      Object.assign(options, this.httpOptions)
    }
    let called = false
    let errorMessage = 'Qtum JSON-RPC: '

    return new Promise((resolve, reject) => {
      let req = this.protocol.request(options, res => {
        let buffer = ''
        res.on('data', data => buffer += data)
        res.on('end', () => {
          if (res.statusCode === 401) {
            reject(new Error(errorMessage + 'Connection Rejected: 401 Unauthorized'))
          } else if (res.statusCode === 403) {
            reject(new Error(errorMessage + 'Connection Rejected: 403 Forbidden'))
          } else if (res.statusCode === 500 && buffer === 'Work queue depth exceeded') {
            let exceededError = new Error(errorMessage + buffer)
            exceededError.code = 429
            reject(exceededError)
          } else {
            try {
              let parsedBuffer = JSON.parse(buffer)
              if (parsedBuffer.error) {
                reject(parsedBuffer.error)
              } else {
                resolve(parsedBuffer.result)
              }
            } catch (err) {
              this.log.error(err.stack)
              this.log.error(buffer)
              this.log.error('HTTP Status code: ' + res.statusCode)
              reject(new Error(errorMessage + 'Error Parsing JSON: ' + err.message))
            }
          }
        })
      })
      req.on('error', err => reject(new Error(errorMessage + 'Request Error: ' + err.message)))
      req.setHeader('Content-Length', request.length)
      req.setHeader('Content-Type', 'application/json')
      req.setHeader('Authorization', 'Basic ' + auth)
      req.write(request)
      req.end()
    })
  }

  async batch(batchCallback) {
    this.batchedCalls = []
    batchCallback()
    await this.rpc(this.batchedCalls)
    this.batchedCalls = null
  }
}

RpcClient.loggers = {
  none: {info: noop, warn: noop, error: noop, debug: noop},
  normal: {info: cl, warn: cl, error: cl, debug: noop},
  debug: {info: cl, warn: cl, error: cl, debug: cl}
}

RpcClient.config = {logger: 'normal'}

const callspec = {
  abandonTransaction: 'str',
  addMultiSigAddress: '',
  addNode: '',
  backupWallet: '',
  createMultiSig: '',
  createRawTransaction: '',
  decodeRawTransaction: '',
  dumpPrivKey: '',
  encryptWallet: '',
  estimateFee: 'int',
  estimatePriority: 'int',
  generate: 'int',
  getAccount: '',
  getAccountAddress: 'str',
  getAddedNodeInfo: '',
  getAddressMempool: 'obj',
  getAddressUtxos: 'obj',
  getAddressBalance: 'obj',
  getAddressDeltas: 'obj',
  getAddressTxids: 'obj',
  getAddressesByAccount: '',
  getBalance: 'str int',
  getBestBlockHash: '',
  getBlockDeltas: 'str',
  getBlock: 'str bool',
  getBlockchainInfo: '',
  getBlockCount: '',
  getBlockHashes: 'int int obj',
  getBlockHash: 'int',
  getBlockHeader: 'str',
  getBlockNumber: '',
  getBlockTemplate: '',
  getConnectionCount: '',
  getChainTips: '',
  getDifficulty: '',
  getGenerate: '',
  getHashesPerSec: '',
  getInfo: '',
  getMemoryPool: '',
  getMemPoolInfo: '',
  getMiningInfo: '',
  getNewAddress: '',
  getPeerInfo: '',
  getRawMemPool: '',
  getRawTransaction: 'str int',
  getReceivedByAccount: 'str int',
  getReceivedByAddress: 'str int',
  getSpentInfo: 'obj',
  getTransaction: '',
  getTxOut: 'str int bool',
  getTxOutSetInfo: '',
  getWork: '',
  help: '',
  importAddress: 'str str bool',
  importPrivKey: 'str str bool',
  invalidateBlock: 'str',
  keyPoolRefill: '',
  listAccounts: 'int',
  listAddressGroupings: '',
  listReceivedByAccount: 'int bool',
  listReceivedByAddress: 'int bool',
  listSinceBlock: 'str int',
  listTransactions: 'str int int',
  listUnspent: 'int int',
  listLockUnspent: 'bool',
  lockUnspent: '',
  move: 'str str float int str',
  prioritiseTransaction: 'str float int',
  sendFrom: 'str str float int str str',
  sendMany: 'str obj int str',
  sendRawTransaction: 'str',
  sendToAddress: 'str float str str',
  setAccount: '',
  setGenerate: 'bool int',
  setTxFee: 'float',
  signMessage: '',
  signRawTransaction: '',
  stop: '',
  submitBlock: '',
  validateAddress: '',
  verifyMessage: '',
  walletLock: '',
  walletPassPhrase: 'string int',
  walletPassphraseChange: '',
};

function generateRPCMethods(rpc) {
  function createRPCMethod(methodName, argMap) {
    return function(...args) {
      let limit = this.batchedCalls ? args.length : args.length - 1
      for (let i = 0; i < limit; i++) {
        if (argMap[i]) {
          args[i] = argMap[i](args[i])
        }
      }
      if (this.batchedCalls) {
        this.batchedCalls.push({
          jsonrpc: '2.0',
          method: methodName,
          params: args,
          id: Number.parseInt(Math.random() * 100000)
        });
      } else {
        this.rpc({
          method: methodName,
          params: args.slice(0, args.length - 1),
          id: getRandomId()
        }, args[args.length - 1])
      }
    }
  }

  let types = {
    str: arg => arg.toString(),
    int: arg => Number.parseFloat(arg),
    float: arg => Number.parseFloat(arg),
    bool: arg => [true, 1, '1'].includes(arg) || arg.toString().toLowerCase() === 'true',
    obj: arg => typeof arg === 'string' ? JSON.parse(arg) : arg
  }

  for (let [key, value] of Object.entries(callspec)) {
    let spec = value.split(' ')
    for (let i = 0; i < spec.length; ++i) {
      if (types[spec[i]]) {
        spec[i] = types[spec[i]]
      } else {
        spec[i] = types.str
      }
    }
    let methodName = key.toLowerCase()
    RpcClient.prototype[methodName] = RpcClient.prototype[key] = createRPCMethod(methodName, spec)
  }
}

generateRPCMethods(rpc)

module.exports = RpcClient