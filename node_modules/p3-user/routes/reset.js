var express = require('express')
var router = express.Router()
var bodyParser = require('body-parser')
var DataModel = require('../dataModel')
var when = require('promised-io/promise').when
var errors = require('dactic/errors')
var UserModel = DataModel.get('user')
var config = require("../config")
// var generateToken = require('../generateToken')
// var validateToken = require('../validateToken')
// var bcrypt = require('bcrypt')

router.use(function (req, res, next) {
  console.log('Reset Route Start')
  next()
})

/* Reset An account with a Reset Code */
router.get('/:email/:code', [
  function (req, res, next) {
    if (!req.params || !req.params.email || !req.params.code) {
      return next(new errors.NotAcceptable('Missing Data in Reset URL'))
    }

    console.log('Resetting Account: ', req.params.email, req.params.code)
    when(UserModel.query('and(eq(email,' + encodeURIComponent(req.params.email) + '),eq(resetCode,' + req.params.code + '))&limit(1)'), function (results) {
      var r = results.getData()
      if (r.length < 1) {
        return next(new errors.NotAcceptable('Invalid Reset Code'))
      }

      req.resetUser = r[0]
      console.log('reset user: ', req.resetUser)
      res.render('change_password', {title: 'Set New Password', request: req})
    }, function (err) {
      next(err)
    })
  }
])

/* post new password to the reset endpoint to reset password and clear the resetCode */
router.post('/:email/:code', [
  bodyParser.urlencoded({ extended: false }),
  function (req, res, next) {
    if (!req.params || !req.params.email || !req.params.code || !req.body || !req.body.password) {
      return next(new errors.NotAcceptable('Missing Data form or URL based data'))
    }
    console.log('Resetting Account: ', req.params.email, req.params.code)
    when(UserModel.query('and(eq(email,' + encodeURIComponent(req.params.email) + '),eq(resetCode,' + req.params.code + '))&limit(1)'), function (results) {
      var r = results.getData()
      if (r.length < 1) {
        return next(new errors.NotAcceptable('Invalid Reset Code'))
      }

      req.resetUser = r[0]

      when(UserModel.setPassword(req.resetUser.id, req.body.password), function () {
        res.redirect(config.get('p3Home'))
      }, next)
    }, function (err) {
      next(err)
    })
  }
])

router.post('/', [
  bodyParser.urlencoded({ extended: false }),
  function (req, res, next) {
    if (!req.body || !req.body.email) {
      return next(new errors.NotAcceptable('Missing Email'))
    }
    when(UserModel.resetAccount(req.body.email, {mail_user: true}), function () {
      console.log('Reset Account Complete')
      res.status(201)
      res.write('OK')
      res.end()
    }, function (err) {
      return new errors.InternalServerError(err.message)
    })
  }
])

module.exports = router
