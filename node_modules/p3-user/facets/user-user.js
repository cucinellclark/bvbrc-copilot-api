var config = require('../config')
var when = require('promised-io/promise').when
var errors = require('dactic/errors')
var RestrictiveFacet = require('dactic/facet/restrictive')
var Result = require('dactic/result')
var realm_map = config.get('realm_map');

module.exports = function (model, opts) {
  return new RestrictiveFacet({
    model: model,
    get: function (id, opts) {
      var decodedId = decodeURIComponent(id)
      return when(this.model.get(decodedId, opts), function (response) {
        // console.log('Facet returning response: ', response)
        // console.log('opts.req.user.id:', opts.req.user.id)
        var user = response.getData()
        if (opts.req.user && opts.req.user.id && (opts.req.user.id === user.id)) {
          delete user.resetCode
          delete user.password
          return new Result(user)
        } else {
          var u = {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            affiliation: user.affiliation,
            organisms: user.organisms,
            realm: realm_map[user.source]
          }
          return new Result(u)
        }
      }, function (err) {
        throw new errors.NotFound(err)
      })
    },

    patch: function (id, patch, opts) {
      // console.log('facet patch', id, patch)
      var _self = this
      return when(this.model.get(id, opts), function (response) {
        // console.log('opts.req.user.id:', opts.req.user.id)
        var user = response.getData()
        if (opts.req.user && opts.req.user.id && (opts.req.user.id === user.id)) {
          return when(_self.model.patch(user.id, patch, opts), function () {
            // console.log("facet patch after model patch")
            return new Result(true)
          }, function (err) {
            // console.log("Error in patch: ", err)
            throw err
          })
        } else {
          throw new errors.Unauthorized()
        }
      })
    },

    query: function (query, opts) {
      return when(this.model.query(query, opts), function (response) {
        
        var users = response.getData()
        if (users && users.length > 0) {
        
          users = users.map(function (user) {
            var u = {
              id: user.id,
              first_name: user.first_name,
              last_name: user.last_name,
              affiliation: user.affiliation,
              organisms: user.organisms,
              realm: realm_map[user.source]
            }
            return u;
          })
        } else {
          users = []
        }
        return new Result(users, response.getMetadata())
      })
    },

    setPassword: function (id, currentPW, password, opts) {
      if (!opts || !opts.req || !opts.req.user || !opts.req.user.id) {
        throw new errors.Unathorized()
      }

      if (!id || (id !== opts.req.user.id)) {
        throw new errors.Unauthorized()
      }

      if (!currentPW) {
        throw new errors.NotAcceptable('Must Include current password')
      }

      if (!password) {
        throw new errors.NotValid('Invalid Password')
      }

      var _self = this
      return when(this.model.validatePassword(id, currentPW), function (vres) {
        var valid = vres.getData()
        if (valid) {
          return when(_self.model.setPassword(id, password, opts), function (R) {
            return R
          }, function (err) {
            return err
          })
        } else {
          throw new errors.Unauthorized('Invalid Current Password')
        }
      })
    }
  })
}
