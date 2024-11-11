var parser = require("rql/parser");
var EventEmitter = require('events').EventEmitter;
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var util=require("util");
var errors = require("./errors");

var Store = module.exports = function(id, options) {
	EventEmitter.call(this);
	this.id = id;
	//console.log("Mixin Store Options: ", options);
	this.options=options;
	this.initialized = new defer();
	if (this.options.primaryKey) {
		this.primaryKey = this.options.primaryKey;
		//console.log("Store Primary Key: ", this.primaryKey);
	}	
	this.init();
}

util.inherits(Store, EventEmitter);

Store.prototype.init=function(){
	var _self=this;

	if (this.options && this.options.queryHandlers){
		this._handlers = this.options.queryHandlers.concat(handlers);
	}

	this.connect().then(function(){
		//console.log("CONNECTED TO DATA SOURCE: ", _self.id);

		if (_self.schema){
			_self.setSchema(_self.schema);		
		}

		_self.initialized.resolve(true);

	}, function(err){
		console.error("Unable to Connect to Data Source: " + err);
		_self.initialized.reject(err);
	})
}

Store.prototype.setSchema=function(schema){
	//console.log("setSchema")
	this.schema=schema;
	var def = new defer();
	def.resolve(true);
	return def.promise;
}

Store.prototype.parseQuery=function(query,opts){
	// IMPLEMENT IN SUBCLASS		
	return new errors.NotImplemented();
}

Store.prototype.get=function(id,opts){
	// IMPLEMENT IN SUBCLASS		
	return new errors.NotImplemented();
}

Store.prototype.query=function(query, opts){
	// IMPLEMENT IN SUBCLASS		
	return new errors.NotImplemented();
}

Store.prototype.put=function(obj, opts){
	// IMPLEMENT IN SUBCLASS		
	return new errors.NotImplemented();
}

Store.prototype["delete"]=function(id, opts){
	// IMPLEMENT IN SUBCLASS		
	return new errors.NotImplemented();
}

