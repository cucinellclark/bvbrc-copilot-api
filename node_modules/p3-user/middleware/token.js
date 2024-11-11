var validateToken = require('../validateToken')
// var DataModel = require('../dataModel')
var when = require('promised-io/promise').when
// var UserModel = DataModel.get('user')
var config = require('../config')
var signingSubjectURL = config.get("signingSubjectURL");

var realm_map = config.get('realm_map');
const realms = Object.keys(realm_map).map((key)=>{
  return realm_map[key]
})

module.exports = function (req, res, next) {
  if (req.headers && req.headers['authorization']) {
    when(validateToken(req.headers['authorization'],signingSubjectURL), function (valid) {
      // valid: either false or {id: 'username@patricbrc.org'}
      if (valid) {
        req.user = valid
        if (req.user.id) {
          var parts = req.user.id.split("@")
          if (realms.indexOf(parts[1])<0){
            next(new Error("Token Failed Validation: Invalid Realm"))
          }
          req.user.id = req.user.id.replace('@' + parts[1], '')
        }
        // console.log("Valid Login: ", valid);
        if (req.user && req.user.roles && (req.user.roles.indexOf('admin') >= 0)) {
          req.apiPrivilegeFacet = 'admin'
        } else {
          req.apiPrivilegeFacet = 'user'
        }
        // console.log('req.user: ', req.user)
        next()
      } else {
        // console.log("Token Failed Validation");
        next(new Error('Token Failed Validation'))
      }
    }, function (err) {
      // console.log("Token Failed Validation: ", err);
      next(err)
    })
  } else {
    req.apiPrivilegeFacet = 'public'
    next()
  }
}
