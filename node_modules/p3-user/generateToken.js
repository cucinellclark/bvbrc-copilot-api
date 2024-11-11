var config = require('./config')
const { v4: uuidv4 } = require('uuid');
var crypto = require('crypto')
var moment = require('moment')
var debug = require('debug')('app')

var path = require('path')
var fs = require('fs')
var SigningPEM
if (config.get('signing_PEM')) {
  var f = config.get('signing_PEM')
  if (f.charAt(0) !== '/') {
    f = path.join(__dirname, f)
  }
  try {
    // console.log('Filename: ', f)
    SigningPEM = fs.readFileSync(f)
    if (SigningPEM) { debug('Found Signing Private Key File') }
  } catch (err) {
    debug('Could not find Private PEM File: ', f, err)
  }
}

module.exports = function generateBearerToken (user, scope) {
  scope = scope || 'user'

  var duration = config.get(scope + 'TokenDuration')

  if (!duration) {
    throw Error('No Token Duration defined for this scope: ' + scope)
  }

  var name = user.username || user.id
  var tokenid = uuidv4()
  var exp = moment()
  exp.add(duration, 'hours')
  var expiration = Math.floor(exp.valueOf() / 1000)
  var realm_map = config.get('realm_map')
  // console.log("Auth user source; ", user.source)
  var realm = realm_map[user.source]
  // console.log("realm: ", realm)
  var payload = [
    'un=' + name + '@' + realm, 'tokenid=' + tokenid,
    'expiry=' + expiration, 'client_id=' + name + '@' + realm,
    'token_type=' + 'Bearer', 'scope=' + scope
  ]

  if (user.roles && user.roles.length > 0) {
    payload.push('roles=' + (user.roles || []).join(','))
  }
  payload.push('SigningSubject=' + config.get('signingSubjectURL'))

  var key = SigningPEM.toString('ascii')
  var sign = crypto.createSign('RSA-SHA1')
  sign.update(payload.join('|'))
  var signature = sign.sign(key, 'hex')
  var token = payload.join('|') + '|sig=' + signature
  // console.log('New Bearer Token: ', token)
  return token
}
