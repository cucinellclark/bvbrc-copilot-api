/**
 * Module dependencies.
 */
// var passport = require('passport');
// var login = require('connect-ensure-login');
// var fs = require('fs-extra')
// var bodyParser = require('body-parser')
// var config = require('./config')
// var uuid = require('node-uuid')
// var crypto = require('crypto')
// var dataModel = require('./dataModel')
// var when = require('promised-io/promise').when
// var bcrypt = require('bcrypt')

exports.index = [
  function (req, res) {
    res.render('index', { title: 'User Service', request: req })
  }
]
