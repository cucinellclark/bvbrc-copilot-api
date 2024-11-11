var fs = require('fs-extra')
var debug = require('debug')
// var Path = require('path')

var facets = {}

fs.readdirSync(__dirname).filter(function (filename) { return filename.match('.js$') && (filename !== 'index.js') }).forEach(function (filename) {
  var parts = filename.replace('.js', '').split('-')
  var name = parts[0]
  var facet = parts[1]
  if (!name || !facet) {
    console.warn('Missing Facet Name or Facet in file: ' + filename)
    return
  }

  debug('Loading Facets' + './' + name + '-' + facet + ' from ' + filename)
  if (!facets[name]) {
    facets[name] = {}
  }
  facets[name][facet] = require('./' + name + '-' + facet)
})

module.exports = facets
