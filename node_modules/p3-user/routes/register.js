const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')
const DataModel = require('../dataModel')
const when = require('promised-io/promise').when
const errors = require('dactic/errors')
const UserModel = DataModel.get('user')
var generateToken = require('../generateToken')

/* Register a new user */
router.post('/', [
  bodyParser.urlencoded({extended: true}),
  bodyParser.json({type: 'application/json'}),
  function (req, res, next) {
    // check for missing fields
    var hasPassword=req.body.password||false
    if (!req.body || !req.body.username || !req.body.email || !req.body.first_name || !req.body.last_name) {
      return next(new errors.BadRequest('Missing required fields'))
    }
    // check for user id rule
    if (req.body.username.match(/[\w.-]+/)[0] !== req.body.username) {
      return next(new errors.BadRequest('Username contains unacceptable characters. Use letters, numbers, underscore(_), dot(.), and dash(-)'))
    }


    console.log('Registering New User: ', req.body.username, req.body.email, "has password: ", hasPassword)

    UserModel.registerUser(req.body).then((registerResp)=>{
      // console.log("registerResp: ", registerResp)
      var user = registerResp.getData()
      // console.log("user: ", user)
      // console.log('req.body: ', req.body)
      if (hasPassword && user){
        // console.log("Generate token for registration with pass")
        var token = generateToken(user, 'user')
        // console.log("Token: ", token)
        var patch = {op: user.lastLogin?"replace":"add",path: "/lastLogin", value: new Date().toISOString()}
        return when(UserModel.patch(user.id, [patch]), function(pathRes){
          // console.log("Write token to output: ", token)
          res.status(200)
          res.send(token)
        })
      }else{
        res.status(201)
      }
      res.end()
    },(err)=>{
      next(err)
    })
  }
])

module.exports = router
