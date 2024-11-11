var express = require('express')
var router = express.Router()
var bodyParser = require('body-parser')
var DataModel = require('../dataModel')
var when = require('promised-io/promise').when
var errors = require('dactic/errors')
var UserModel = DataModel.get('user')
var config = require("../config")


/* Verify an email with a verification code */
router.get('/:email/:code', [
  function (req, res, next) {
    if (!req.params || !req.params.email || !req.params.code) {
      return next(new errors.NotAcceptable('Missing Data in Reset URL'))
    }

    console.log('Verifying Account Email: ', req.params.email, req.params.code)
    when(UserModel.query('and(eq(email,' + encodeURIComponent(req.params.email) + '),eq(verification_code,' + req.params.code + '))&limit(1)'), function (results) {
      var r = results.getData()
      // console.log("r: ", r)
      if (r.length < 1) {
        // return next(new errors.NotAcceptable('Invalid Verification Code'))
        return res.redirect(config.get('p3Home') + '/verify_failure')
      }

      req.resetUser = r[0]

      when(UserModel.verifyEmail(req.resetUser.id), function () {
        // console.log("Email Verified")
        res.redirect(config.get('p3Home') + '/verify_refresh')
      }, next)
    }, function (err) {
      next(err)
    })
  }
])

router.post('/', [
  bodyParser.urlencoded({ extended: false }),
  bodyParser.json(),
  function (req, res, next) {
    // console.log("req.body: ", req.body)

    if (!req.user) {
      return next(new errors.Unauthorized('Invalid Token'))
    }

    if (!req.body || !req.body.id) {
      return next(new errors.NotAcceptable('Missing User ID'))
    }
    when(UserModel.sendVerificationEmail(req.body.id), function () {
      res.status(201)
      res.write('OK')
      res.end()
    }, function (err) {
      console.log("Verify Error Handler")
      next(err)
    })
  }
])

module.exports = router
