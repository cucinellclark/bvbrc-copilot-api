var debug = require("debug")("dme:facet");
var errors = require("../errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var introspect = require("introspect");

var Facet = module.exports =  function(wrapper){
	EventEmitter.call(this);

	for (prop in wrapper) {
		this[prop]=wrapper[prop];
	}

	if (this.model) { this.init(); }
}

util.inherits(Facet, EventEmitter);

Facet.prototype.model=null;
Facet.prototype.permissive=false;
Facet.prototype.maxLimit=100;
Facet.prototype.defaultLimit=25;
Facet.prototype.allowedOperators="*" ;
	
Facet.prototype.init=function(){
	this._smd = this.model.getServiceDescription();
	var services = this._smd.services;
	if (this.permissive) {
		Object.keys(services).forEach(function(method){
			//console.log("Permissive Methods: ", method);
			if (typeof this[method] == 'undefined'){
				this[method] = function(){
					//console.log("Facet Wrapper Arguments for " + method + ":", arguments);
					//console.log("  wrapper args is array: ", arguments instanceof Array);
					return this.model[method].apply(this.model,arguments);
				}
			}
		},this);
	}else{
		Object.keys(services).forEach(function(method){
			if (this[method] === true){
				this[method] = function(){
					//console.log("Priv Facet call model method with args: ", arguments);
					return this.model[method].apply(this.model, arguments);	
				}
			}else if (typeof this[method]=='function'){
				var params = introspect(this[method])
				if (params[params.length-1]=="/*expose*/") {
					this._smd.services[method] = {
						type: "method",
						parameters: []
					}

					debug("Expose Function: ", method);
					var svcParams = params.forEach(function(p,idx) { 
						if (!p.match(/\/\*/)){
							if (params[idx+1] && params[idx+1].match(/\/\*/) && params[idx+1]!="/*expose*/"){
								var type = params[idx+1].replace("/*","").replace("*/","");
								this._smd.services[method].parameters.push({name: p, type: type});
							}else{
								this._smd.services[method].parameters.push({name: p});
							}
						}
					},this);
	
					debug("svcParams: ", svcParams);
				}else{
					debug("Facet Method Exists for " + method + ", but does not include an /*expose*/ comment");
				}	
			}else{
				debug("\tNot Found remove from Facet SMD: " + method);
				delete services[method];
				}
		},this);
	}

	debug("Check for Facet Only Methods");
	for (var method in this){
		if (typeof this[method] == 'function') {
			var params = introspect(this[method]);
			debug("Method: ", method, "Expose: ", params[params.length-1]=="/*exposed*/");
			if (params[params.length-1]=="/*exposed*/") {
				debug("Expose method: ", method, "params: ", params);	
				this._smd.services[method] = {
					type: "method",
					parameters: []
				}

				var svcParams = params.forEach(function(p,idx) {
					if (!p.match(/\/\*/)){
						if (params[idx+1] && params[idx+1].match(/\/\*/) && params[idx+1]!="/*expose*/"){
							var type = params[idx+1].replace("/*","").replace("*/","");
							this._smd.services[method].parameters.push({name: p, type: type});
						}else{
							this._smd.services[method].parameters.push({name: p});
						}
					}
				},this);

				//debug("svcParams: ", svcParams);
			}else{
				//debug("Skipping Method: ", methodparams);
			}
		}
	}
}

Facet.prototype.use=function(model){
	if (!model) { throw new Error("Model Missing"); }
	this.model=model;
	this.init();	
}

Facet.prototype.getSchema=function(){
	debug("Facet getSchema()");
	var self=this;
	if (this.schema) {
		debug("using manual/cached schema");
		return this.schema;
	}else {
		return when(this.model.getSchema(), function(schema){
			// override visible properties in the schema
			//  properties can be:
			//	With a string or array the behavior is the same for both permissive and non-permissive faets

			//	a string: "*"  to allow all properties
			//      array: ["foo","bar*"]  an array of property names or patterns to allow

			//	With an object on a permissive facet, properties simply override or added to the schema from the model
			//	On a non-permissive facet, only those properties listed are available.
						
			// 	object: { foo: {...}, bar: {...} } 	
			if (self.properties && (self.properties != "*") && schema && schema.properties) {
				debug("Mapping Schema Properties");	
				Object.keys(schema.properties).forEach(function(prop){
					if (self.properties instanceof Array) {
						if (!self.properties.some(function(p){
							return prop.match(p);	
						})){
							debug("Deleting " + prop + " from PrivilegeFacet");
							delete schema.properties[prop];	
						}
					}else if (self.properties[prop] === false) {
						debug("Deleting disabled " + prop + " from PrivilegeFacet");
						delete schema.properties[prop];
					}else if (self.properties[prop] === true ){
						debug("Exposing " + prop + " in schema");
						// don't do anyting just keep this property
					}else if (self.properties[prop] && typeof self.properties[prop]=='object'){
						debug("Exposed overridden properties for " + prop);
						schema.properties[prop]=self.properties[prop];
					}else if (!self.permissive){
						debug("Delete disallowed property " + prop);
						delete schema.properties[prop];
					}
				});
			}

			self.schema = schema;
			return schema;
		}, function(err){
			debug("Error Filtering properties in Facet schema",err);
			return;
		});
	}
}

Facet.prototype.getServiceDescription=function(){
	return this._smd;
}

Facet.prototype.get=function(id,opts /*expose*/){
	//console.log("PrivilegeFacet get()", id);
	if (this.permissive) {
		return this.model.get(id,opts);
	}
	throw new errors.NotFound();
}

Facet.prototype.query=function(query, opts /*expose*/){
	//console.log("Privilege Facet query: ", query);
	if (this.permissive) {
		return this.model.query(query,opts);
	}
	throw new errors.NotFound();
}

Facet.prototype.put=function(obj, opts /*expose*/){
	if (this.permissive) {
		return this.model.put(obj,opts);
	}
	throw new errors.NotFound();
}

Facet.prototype.post=function(obj, opts /*expose*/){
	if (this.permissive) {
		return this.model.post(obj,opts);
	}
	throw new errors.NotFound();
}

Facet.prototype['delete']=function(id, opts /*expose*/){
	if (this.permissive) {
		return this.model['delete'](id,opts);
	}
	throw new errors.NotFound();
}
