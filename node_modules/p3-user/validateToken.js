// var userIdRegex = /un=([\w\-.@]+@\w+(\.\w+))/
var userIdRegex = /un=([\w\-.@]+@\w+[\.\w]+)/
var crypto = require('crypto')
var request = require('request')
var Defer = require('promised-io/promise').defer
var when = require('promised-io/promise').when

var ssCache = {}

var getSigner = function (signer) {
  var def = new Defer()
  if (ssCache[signer]) {
    def.resolve(ssCache[signer])
    return def.promise
  }
  request.get({url: signer, json: true}, function (err, response, body) {
    if (err) { return def.reject(err) }
    if (!body) { return def.reject('Empty Signature') }
    // console.log("body: ", body);
    // console.log("Signature: ", body.pubkey);
    ssCache[signer] = body.pubkey
    def.resolve(body.pubkey)
  })
  return def.promise
}

var validateToken = function (token,signingSubject) {
  var parts = token.split('|')
  var parsedToken = {}
  var baseToken = []
  parts.forEach(function (part) {
    var tuple = part.split('=')
    if (tuple[0] !== 'sig') {
      baseToken.push(part)
    }
    parsedToken[tuple[0]] = tuple[1]
  })

  if (parsedToken.SigningSubject!==signingSubject){
    new Error("Invalid Signing Subject: " + signingSubjectURL)
  }

  return when(getSigner(parsedToken.SigningSubject), function (signer) {
    // console.log("Got Signer Cert: ", signer);
    // console.log("Signature: ", parsedToken.sig);
    var verifier = crypto.createVerify('RSA-SHA1')
    // console.log("data: ", baseToken.join('|'));
    verifier.update(baseToken.join('|'))
    var success = verifier.verify(signer.toString('ascii'), parsedToken.sig, 'hex')
    // console.log("validation success: ", success);
    return success
  }, function (err) {
    console.log('Error retrieving SigningSubject: ', parsedToken.SigningSubject)
    return false
  })
}

module.exports = function (token,signingSubject) {
  return when(validateToken(token,signingSubject), function (valid) {
    if (!valid) {
      console.log('Invalid Token')
      return false
    }

    var user = {}
    var matches = token.match(userIdRegex)
    if (matches && matches[1]) {
      user.id = matches[1]
    }

    // console.log('User from Token: ', user);
    if (user && user.id) {
      return user
    }
    return false
  },function(err){
    return false;
  })
}
