var fs = require('fs-extra')
var debug = require('debug')('dactic')

var models = {}

fs.readdirSync(__dirname).filter(function (filename) { return filename.match('.js$') && (filename !== 'index.js') && (filename !== 'base.js') }).forEach(function (filename) {
  var name = filename.replace('.js', '')
  debug('Loading Models' + './' + name + ' from ' + filename)
  models[name] = require('./' + name)
})

module.exports = models
