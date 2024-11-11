var debug = require("debug")("dme:store:solr");
var MongoClient = require('mongodb').MongoClient 
var Deferred = require("promised-io/promise").defer;
var All= require("promised-io/promise").all;
var Sequence= require("promised-io/promise").seq;
var Query = require("rql/query");
var LazyArray = require("promised-io/lazy-array").LazyArray;
var StoreBase=require("dactic/store");
var util = require("util");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var ObjectID = require('bson').ObjectID;
var jsArray = require("rql/js-array");
//var RQ = require("rql/parser");
var RQ = require("./rql");

var Result = require("dactic/result");

var Store = module.exports = function(id,options){
	StoreBase.apply(this,arguments);
}

util.inherits(Store, StoreBase);

Store.prototype.authConfigProperty="solr";
Store.prototype.primaryKey="id";
Store.prototype.connect=function(){
	var def = new defer()
	if (this.options && this.options.url) {
		debug("Creating MongoClient client @ " + this.options.url + "/" + this.id);
		var _self=this;
		var client = MongoClient(this.options.url,this.options.opts || {});
                var dbName;

                if (this.options.db){
                  dbName = this.options.db;
                }else {
		  var parts = this.options.url.split("/")
		  dbName = parts[parts.length-1]
                }

		client.connect(function(err){
			if (err){
				def.reject(Error("Unable to connect to MongoDB: " + err));
			}
			_self.client=client.db(dbName);
			def.resolve(client);
		});
	}else{
		def.reject(new Error("Missing MongoDB configuration in Store Init"));
	}

	return def.promise;
}

Store.prototype.getSchema=function(){
	debug("getSchema()");
	return this.schema || {}	
}

Store.prototype.increment = function(id,obj){
	var q = {};
	q[this.primaryKey] = id;
	var update = {"$inc": obj};
	var def = new Deferred();

	var collection = this.client.collection(this.collectionId || this.id);
	collection.update(q, update, function(err, res){
		if (err) return def.reject(err);
		def.resolve(new Result(true));
	});

	return def.promise;
}

Store.prototype.setSchema=function(schema){
	debug("mongodb: setSchema()", schema);
	this.schema=schema;
	var _self=this;
	var db = this.client;
	var def = new Deferred()
	var colDef = new Deferred();
	if (this.client){

		_self.client.collection(_self.id, function(err,col){
			if (err){
				console.warn("Error Retrieving Collection: " + err);
				return colDef.reject(err)
			}
			col.stats(function(err,stats){
				if (!stats){
					_self.client.createCollection(_self.id, function(err,col){
						colDef.resolve(col);
					})
				}else{
					colDef.resolve(col)
				}
			})

		}, function(err){
			colDef.reject("Unable to find or create collection: " + _self.id)
		})
	}else{
		colDef=false;
		def.resolve(true);
	}

	//ensure index;
	if (colDef){
		when(colDef, function(col){
			debug("Check for Indexes");
			var indexes=[]
			if (_self.schema && _self.schema.properties){
			Object.keys(_self.schema.properties).forEach(function(prop){
					if (_self.schema.properties[prop] && _self.schema.properties[prop].index){
						var spec = {name: prop, unique: _self.schema.properties[prop].unique?true:false};
						indexes.push(col.createIndex(prop,{w:1, unique:_self.schema.properties[prop].unique?true:false }));
					}
				})
				when(All(indexes), function(){
					def.resolve(true);
				})

			}else{
				def.resolve(true);
			}
		}, function(err){
			def.reject(err);
		})
	}

	return def.promise;

}

Store.prototype.query=function(query, opts){
	var _self=this;
	var deferred = new defer();
	//var query = new Query(query);
	if (!this.client){ return deferred.reject(Error("Not Connected")); }
	var collection = this.client.collection(this.collectionId || this.id);

	// compose search conditions
	var x = parse(query, opts);
	var meta = x[1], search = x[0];

	

	// range of non-positive length is trivially empty
	//if (options.limit > options.totalCount)
	//	options.limit = options.totalCount;
	if (meta.limit <= 0) {
		var results = [];
		results.totalCount = 0;
		return results;
	}

	//console.log("SEARCH: ", search);
	//console.log("META: ", meta);

	var handler = function(err,cursor){
		//console.log("handler args: ", arguments);
		if (err) return deferred.reject(err);
		cursor.toArray(function(err, results){
			//console.log("MONGO RESULTS: ", results);
			if (err) return deferred.reject(err);
			// N.B. results here can be [{$err: 'err-message'}]
			// the only way I see to distinguish from quite valid result [{_id:..., $err: ...}] is to check for absense of _id
			if (results && results[0] && results[0].$err !== undefined && results[0]._id === undefined) {
				return deferred.reject(results[0].$err);
			}
			var fields = meta.select && (meta.select.length>0);
			//console.log("fields: ",fields);
			var len = results.length;
			// damn ObjectIDs!
			if (!_self.options.dontRemoveMongoIds){
				for (var i = 0; i < len; i++) {
					delete results[i]._id;
				}
			}
			// kick out unneeded fields
			if (fields) {
				//results = jsArray.executeQuery('select(' + fields + ')', {},results);
				//console.log("Post Select results: ", results);
				// unhash objects to arrays
				if (meta.unhash) {
					results = jsArray.executeQuery('values('+fields+')', {}, results);
				}
			}
			// total count
			// when(totalCountPromise, function(result){
			cursor.count().then((tc)=>{
				var metadata = {}
				metadata.count = results.length;
				metadata.start = meta.skip||0;
				metadata.end = (meta.skip||0) + (results.length-1)
				metadata.totalCount = tc;

				debug("MongoDB Store Results: ", results)
				debug("   Result Meta: ", metadata);
				deferred.resolve(new Result(results,metadata))
			})
	
			// });
		});

	}

	if (meta.distinct){
		collection.distinct(meta.distinct,search,function(err,docs){
			if (err) return deferred.reject(err);

			var metadata = {}
			metadata.count = docs.length;
			metadata.start = meta.skip;
			metadata.end = meta.skip + docs.length;
			metadata.totalCount = docs.length;
			deferred.resolve(new Result(docs,metadata));
		});
	}else if (meta.join){
		//console.log("collection.aggregate: ", JSON.stringify(meta.join));
		var cursor = collection.aggregate(meta.join,{cursor: {batchSize:3000}})
		
			var docs = []

			cursor.on("data",function(d){ docs.push(d); });
			cursor.on("end", function(data){
				if (data) { console.log("ERROR DATA IN END UNHANDLED")}
				//console.log("docs: ", docs);
				var metadata = {}
				metadata.count = docs.length;
				metadata.start = meta.skip;
				metadata.end = meta.skip + docs.length;
				metadata.totalCount = docs.length;
				deferred.resolve(new Result(docs,metadata));
			});
			cursor.on("error", function(err){ deferred.reject(err); });
	}else{
		collection.find(search, meta, handler);
	}
	return deferred.promise;
}

Store.prototype.get=function(id, opts){
	var _self = this;
	var def = new defer();
	var query = {};
	query[this.primaryKey] = id;
	var collection = this.client.collection(this.collectionId || this.id);
	collection.find(query).toArray(function(err,docs){
		if (docs[0]) { 
			if (!_self.options.dontRemoveMongoIds){
				delete docs[0]._id; 
			}
			return def.resolve(new Result(docs[0])); 
		}
		def.reject();
	});
	return def.promise;
}

Store.prototype.post=function(obj, opts){
	return when(this.put(obj,opts),function(results){
		var obj = results.results;
		return new Result(obj);
	});
}

Store.prototype.put=function(obj, opts){
	//console.log("Store.put(obj): ",obj);
	var _self=this;
	var deferred = defer();
	opts = opts || {};
	var search = {id: obj[this.primaryKey]};
	var collection = this.client.collection(this.collectionId || this.id);
	if (!opts.overwrite) {
	// do an insert, and check to make sure no id matches first
		collection.findOne(search, function(err, found){
			if (err) return deferred.reject(err);
			if (found === null) {
				if (!obj[_self.primaryKey]) {
//					console.log("Generating ID on " + _self.primaryKey);
					obj[_self.primaryKey] = ObjectID.createPk().toJSON();
				}


				//console.log("collection.insert: ",obj);
				collection.insertOne(obj, function(err, robj){
					//console.log("store collection insert res: ", robj);
					if (err) {
						console.log("Store Collection Insert Error: ", err);
						return deferred.reject(err);
					}
					// .insert() returns array, we need the first element
					robj = robj && robj[0];
					if (robj && (!_self.options.dontRemoveMongoIds)) delete robj._id;
					deferred.resolve(new Result(robj));
				});
			} else {
				deferred.reject(id + " exists, and can't be overwritten");
			}
		});
	} else {
		//console.log("store.put() update: ", obj);
		collection.update(search, obj, {upsert: opts.overwrite}, function(err, res){
			if (err) return deferred.reject(err);
			if (obj && (!_self.options.dontRemoveMongoIds)) delete obj._id;
			deferred.resolve(new Result(obj));
		});
	}

	return deferred.promise;
}

Store.prototype.delete=function(id,opts){
	var deferred = defer();
	var collection = this.client.collection(this.collectionId || this.id);
	var search = {}
	search[this.primaryKey]=id
	// console.log("Search: ", search);
	collection.deleteOne(search, function(err, result){
		if (err) return deferred.reject(err);
		// console.log("Delete Result: ", result);
		deferred.resolve(new Result(true));
	});
	return deferred;
}
	

function parse(query,directives){
	// parse string to parsed terms
	if(typeof query === "string"){
		query = new RQ(query); // RQ.parseQuery(query);
	}
/*
	console.log("parse query: ", query);
	var options = {
		skip: 0,
		limit: +Infinity,
		lastSkip: 0,
		lastLimit: +Infinity
	};
*/

	var mq = query.toMongo();
//	console.log("mq: ", mq);

	return mq;
}



