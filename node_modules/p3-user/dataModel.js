var DataModel = require('dactic/datamodel')
var RestrictiveFacet = require('dactic/facet/restrictive')
var PermissiveFacet = require('dactic/facet/permissive')
var models = require('./models')
var facets = require('./facets')

var MongoStore = require('dactic-store-mongodb')
var config = require('./config')
// var when = require('promised-io/promise').when

var dataModel = new DataModel({})

var facetTypes = ['public', 'user', 'admin']

Object.keys(models).forEach(function (modelId) {
  var mongoStore = new MongoStore(modelId, {url: config.get('mongo').url, primaryKey: 'id'})
  // console.log("Setup Model: ", modelId);
  var model = new models[modelId](mongoStore, {})
  var mf = {}

  facetTypes.forEach(function (type) {
    if (facets[modelId] && facets[modelId][type]) {
      mf[type] = facets[modelId][type](model)
    } else if (type === 'admin') {
      mf[type] = new PermissiveFacet({model: model})
    } else {
      mf[type] = new RestrictiveFacet({model: model})
    }
  })

  dataModel.set(modelId, model, mf)
})

module.exports = dataModel
