var debug = require("debug")("dactic:model")
var errors = require("./errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var introspect = require("introspect");
var uuid = require("uuid");
var AJV = require("ajv");
var jsonpatch = require("json-patch");

var Model = module.exports =  function(store,opts){
	EventEmitter.call(this);

	if (!store) {
		throw Error("Store is required to instantiate Model");
	}

	this.store = store;
	this.opts = opts;
	if (this.opts.primaryKey){
		this.primaryKey = this.opts.primaryKey;
	}

	this.init();
}

util.inherits(Model, EventEmitter);

Model.prototype.generateSchema=false;
Model.prototype.rpc=false;
Model.prototype.allowedOperators="*";

Model.prototype.init = function(){
	if (this.schema && this.store){
		this.store.setSchema(this.schema);
	}
}

Model.prototype.getSchema=function(){
	if (this.generateSchema && this.store && this.store.getSchema){
		if (!this._generatedSchema){
			debug("Build Schema");
			return this.buildSchema();
		}else{
			debug("_generatedSchema");
			return this._generatedSchema;
		}
	}
	return this.schema;
}

Model.prototype.buildSchema=function(){
	debug("buildSchema");
	var def = new defer();
	var self=this;
	when(this.store.getSchema(), function(schema){
		self._generatedSchema  = schema;
		Object.keys(self.schema).forEach(function(prop){
			if ((prop != "properties")&& typeof self.schema[prop] != 'undefined'){
				self._generatedSchema[prop]=self.schema[prop];
			}
		});
		def.resolve(self._generatedSchema);
	}, function(err){
		def.reject(err);
	})

	return def.promise;
}


Model.prototype.getServiceDescription=function(){
	var smd = {
		transport: "RAW_POST",
		envelope: "JSON-RPC-2.0",
		contentType: "application/json"	,
		services: {}	 	
	}

	for (var prop in this) {
		//console.log("Building SMD Method: ", prop);
		if (typeof this[prop] == 'function') {
			var params = introspect(this[prop])
			//console.log("    Method Params: ", params);
			if (params[params.length-1]=="/*expose*/") {
				smd.services[prop] = {
					type: "method",
					parameters: []
				}

				//debug("Expose Function: ", prop);
				var svcParams = params.forEach(function(p,idx) { 
					if (!p.match(/\/\*/)){
						if (params[idx+1] && params[idx+1].match(/\/\*/) && params[idx+1]!="/*expose*/"){
							var type = params[idx+1].replace("/*","").replace("*/","");
							smd.services[prop].parameters.push({name: p, type: type});
						}else{
							smd.services[prop].parameters.push({name: p});
						}
					}
				});

				//debug("svcParams: ", svcParams);
			}	
		}
	}

	this.serviceDescription = smd;
	return this.serviceDescription;
}

Model.prototype.mixinObject=function(object,updated){
	var _self=this;
	var out = {};
	if (object.id) { out.id = object.id }
	if (!this.schema || !this.schema.properties) { throw Error("Missing Schema Properties"); }
	Object.keys(this.schema.properties).forEach(function(prop){
		var propDef = _self.schema.properties[prop];
		if (_self.schema.required && _self.schema.required.indexOf(prop)>=0){
			propDef.optional = false;
		}else{
			propDef.optional = true;
		}

		//debug("prop: ", prop, "propDef: ", propDef);
		if (!prop || (prop=="id") || (typeof propDef=="function")) { return; }
		if ((propDef.readonly)&&(typeof object[prop]!="undefined")){
			out[prop]=object[prop];
		}
	
		if (propDef.transient){
			return;
		}


		if ((typeof object[prop]=="undefined") && (typeof updated[prop]=='undefined') ){
			if (typeof propDef['default'] != "undefined") { 
				out[prop]=propDef['default'];  
			}

			if (!propDef.optional && typeof out[prop]=="undefined"){
				throw new errors.NotAcceptable("'" + prop + "' is a required property.");
			}
		}else if (!updated[prop] && object[prop]) {
			out[prop]=object[prop];
		}else if (updated[prop]){
			out[prop]=updated[prop];
		}else{
			//debug("Property Not Defined: ", prop);
		}

		if (propDef['enum'] && updated[prop] && (propDef['enum'].indexOf(updated[prop])==-1)){
			throw new errors.NotAcceptable("'" + prop + "' must be one of: " + propDef['enum'].join(", "));
		}
			
		if (propDef.type && out[prop]) {
			//debug("Check out[prop] as ", propDef.type, propDef, typeof out[prop]);
			var udType = typeof out[prop];
			
			if (propDef.type=="date") {
				//debug("Date Property: ",prop, out[prop]);
				if (typeof out[prop]=="string"){
					//debug("Convert ISO String to Date Object");
					out[prop]=new Date(Date.parse(out[prop]));
					//debug("Converted: ", out[prop]);
				}

				if (!(out[prop].toISOString)){
					throw new errors.NotAcceptable("'" + prop +"' expected to be of type " + propDef.type + ", but was " + udType); 
				}
			} else if ((propDef.type=="array") && (udType=="object" ) && ((out[prop] instanceof Array)||(out[prop].forEach))) {
				// do nothing		
			} else if (propDef.type != udType){
				throw new errors.NotAcceptable("'" + prop +"' expected to be of type " + propDef.type + ", but was " + udType); 
			}
		}

		if (propDef.validation && out[prop]) {
			if (typeof propDef.validation == 'string'){
				propDef.validation = new RegExp(propDef.validation);
			}

			if (propDef.validation instanceof RegExp){
				if (!out[prop].match(propDef.validation)){
					throw new errors.NotAcceptable("'" + prop + "' did not pass validation.  Invalid value: " + out[prop]);
				}
			}else if (typeof propDef.validation=='function'){
				if (!propDef.validation(out[prop])){
					throw new errors.NotAcceptable("'" + prop + "' did not pass validation.  Invalid value: " + out[prop]);
				}
			}	
		}
	});


	//copy any properties that weren't part of the schema onto the output object from the original object
	Object.keys(object).filter(function(prop){
		if (_self.schema[prop]) { return false; }
		return true;
	}).forEach(function(prop){
		out[prop]=object[prop];
	});

	//copy any properties that weren't part of the schema onto the output object from the updatedObject, overwriting
	//those props if they had been set by the above.  Properties beginning with _ are treated as transient properties
	//and dropped that this point

	Object.keys(updated).filter(function(prop){
		if (prop.charAt(0)=="_") { return false; }
		if (_self.schema[prop]) { return false; }
		return true;
	}).forEach(function(prop){
		out[prop]=updated[prop];
	});

	return out;	
}

Model.prototype.setSchema=function(schema){
	this.store.setSchema(schema);	
}

Model.prototype.get=function(id,opts /*expose*/){
	debug("Call Store Get: ", id, "store id", this.store.id);
	return this.store.get(id,opts);
}

Model.prototype.query=function(query, opts /*expose*/){
	debug("BaseModel query()", query);
	return this.store.query(query, opts);
}

Model.prototype.put=function(obj, opts /*expose*/){
	var schema = this.getSchema();

	if (schema){
		try {

			var ajv = new AJV({
		                v5: true,
		                allErrors: true,
		                verbose: true,
				useDefaults: true
		        });

		        var valid = ajv.validate(schema,obj);
		} catch(err){
			console.log("Error Running Validator", err);
			throw Error("Error Running Validator");
		}

		if (!valid){
			//console.log("ajv.errors: ", ajv.errors);
			//console.log("ajv.errorsText()", ajv.errorsText());
			throw new Error(ajv.errorsText());
		}
	}

	return when(this.store.put(obj,opts), function(results){
		return results;
	});
}

Model.prototype.post=function(obj, opts /*expose*/){
	var _self=this;
	opts=opts||{}

	if (obj && !obj.id){
		if (opts && opts.id) {
			obj[_self.primaryKey] = opts.id;
		}else if ((_self.opts && !_self.opts.skipIDGeneration) && !_self.skipIDGeneration){
			obj[_self.primaryKey] = uuid.v4();
		}
		
		return when(_self.put(obj,opts), function(res){
			return res;
		},function(err){
			console.log("Error Creating User: ", err);
			return err;
		});

	}else{
		return new errors.BadRequest();
	}
}

Model.prototype.patch=function(id,patch,opts /*expose*/){
	var _self=this;
	opts=opts||{};
	return when(_self.get(id,opts), function(result){
		var obj = result.getData();
        	patch.forEach(function(p){
                	jsonpatch.apply(obj,p);
        	})		
		opts.overwrite=true;
		return _self.put(obj,opts);
	}, function(err){
		return new errors.NotFound();
	});
}
	
Model.prototype['delete']=function(id, opts /*expose*/){
	return this.store.delete(id,opts);
}
