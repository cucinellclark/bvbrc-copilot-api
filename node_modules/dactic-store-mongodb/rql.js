var debug = require('debug')('solrjs:rql')
var EventEmitter = require('events').EventEmitter;
var util=require("util");
var defer = require("promised-io/promise").defer;
var when= require("promised-io/promise").when;
var RQLQuery= require("rql/query").Query;
var parser = require("rql/parser");

RQLQuery.prototype.infinity = 9999999999
RQLQuery.prototype.toMongo= function(opts){
        var meta = {
                sort: [],
                limit: [Infinity, 0, Infinity],
                skip: 0,
                limit: Infinity,
                select: [],
                values: false
        };

	var out = queryToMongo(this,meta)
	//console.log("toMongo out: ", out, meta);

	return [out,meta];
}

RQLQuery.prototype.normalize = function(options){
        options = options || {};
        options.primaryKey = options.primaryKey || 'id';
        options.map = options.map || {};
        var result = {
                original: this,
                sort: [],
                limit: [Infinity, 0, Infinity],
                skip: 0,
                limit: Infinity,
                select: [],
                values: false
        };
        var plusMinus = {
                // [plus, minus]
                sort: [1, -1],
                select: [1, 0]
        };
        function normal(func, args){
                // cache some parameters
                if (func === 'sort' || func === 'select') {
                        result[func] = args;
                        var pm = plusMinus[func];
                        result[func+'Arr'] = result[func].map(function(x){
                                if (x instanceof Array) x = x.join('.');
                                var o = {};
                                var a = /([-+]*)(.+)/.exec(x);
                                o[a[2]] = pm[(a[1].charAt(0) === '-')*1];
                                return o;
                        });
                        result[func+'Obj'] = {};
                        result[func].forEach(function(x){
                                if (x instanceof Array) x = x.join('.');
                                var a = /([-+]*)(.+)/.exec(x);
                                result[func+'Obj'][a[2]] = pm[(a[1].charAt(0) === '-')*1];
                        });
                } else if (func === 'limit') {
                        // validate limit() args to be numbers, with sane defaults
                        var limit = args;
                        result.skip = +limit[1] || 0;
                        limit = +limit[0] || 0;
                        if (options.hardLimit && limit > options.hardLimit)
                                limit = options.hardLimit;
                        result.limit = limit;
                        result.needCount = true;
                } else if (func === 'values') {
                        // N.B. values() just signals we want array of what we select()
                        result.values = true;
                } else if (func === 'eq') {
                        // cache primary key equality -- useful to distinguish between .get(id) and .query(query)
                        var t = typeof args[1];
                        //if ((args[0] instanceof Array ? args[0][args[0].length-1] : args[0]) === options.primaryKey && ['string','number'].indexOf(t) >= 0) {
                        if (args[0] === options.primaryKey && ('string' === t || 'number' === t)) {
                                result.pk = String(args[1]);
                        }
                }else if (func == "facet"){
			result.facets = result.facets.concat(args);	
		} else if (func == "group"){
			result.groupings= result.groupings.concat(args);	
		} else if (func == "json"){
			result.json[args[0]]="";
			for(var i=1;i<args.length;i++){
				result.json[args[0]]= result.json[args[0]] + args[i];
			}
		}



                // cache search conditions
                //if (options.known[func])
                // map some functions
                //if (options.map[func]) {
                 //       func = options.map[func];
                //}
        }
        this.walk(normal);
        return result;
};

function encodeString(s) {
	if (typeof s === "string") {
		s = encodeURIComponent(s);

		if (s.match(/[\(\)]/)) {
			s = s.replace("(","%28").replace(")","%29");
		};

		s = s.replace(/\%3A/g,":");

		s = s.replace(/\%22/g,'"');

		s = s.replace(/\\+/g,"%2B");

		//console.log("REPLACED: ", s);
	
		if (s.charAt(0)=='"' && s.charAt(s.length-1)=='"'){
			//console.log("Use quotes here");
			s = '"' + s.slice(1,s.length-1).replace('"',"%22") + '"'
		}else{
			s = s.replace('"',"%22");
		}	


	}
	return s;
}

var encodeValue = exports.encodeValue = function(val) {
	//console.log("ENOCDE VALUE: ", val);
	var encoded;
	if (val === null) val = 'null';

	if (val && val !== parser.converters["default"]('' + (
		(val.toISOString)? val.toISOString():val.toString()
	))) {
		var type = typeof val;
		if(val instanceof RegExp){
			// TODO: control whether to we want simpler glob() style
			val = val.toString();
			var i = val.lastIndexOf('/');
			type = val.substring(i).indexOf('i') >= 0 ? "re" : "RE";
			val = encodeString(val.substring(1, i));
			encoded = true;
		}
		if(type === "object" && val && val.getTime){
			type = "epoch";
			val = val.getTime();
			encoded = true;
		}
		if(type === "string") {
			val = encodeString(val);
			encoded = true;
		}
		val = [type, val].join(":");
	}

	if (!encoded && typeof val === "string") val = encodeString(val);

	/*
	if (val && typeof val == 'string') {
		val = val.replace("%2B","+").replace("+","\\\+");
	}
	*/

	//console.log("ENCODED VAL: ", val);
	return val;
};

function serializeArgs(array, delimiter){
        debug("serializeArgs Array: ", array, delimiter);
        var results = [];
        for(var i = 0, l = array.length; i < l; i++){
		if (array[i]) {
			var x = queryToMongo(array[i]);
			if (x) {
                		results.push(queryToMongo(array[i]));
			}
		}
        }
        return results.join(delimiter);
}

function queryToMongo(part,options) {
	options = options || {}

	//console.log("queryToMongo: ", part);

	if (part instanceof Array) {
		return part.map(queryToMongo);
		return part;
	}else if (typeof part === "object" && part && part.name && part.args && _handlerMap[part.name]) {
		//console.log("HANDLE: ", part.name, " Part: ", part);
		return _handlerMap[part.name](part,options);
	}else if (typeof part == "string"){
		//console.log("DECODE URI COMPONENT: ", part);
		return decodeURIComponent(part);
	}else{
		return part;
	}

};

module.exports =  RQLQuery;


var handlers = [ 
		["and", function(query, options){
			var parts=[]
			query.args.forEach(function(a){
				var p = queryToMongo(a,options);
				if (p){
					parts.push(p);
				}
			});
			parts = parts.filter(function(p){
				return !!p;
			});

			if (parts.length<1){
				return {}
			}

			if (parts.length==1) {
				return parts[0]
			}
			return {"$and": parts};
		}],	

		["or", function(query, options){
			var parts=[]
			query.args.forEach(function(a){
				parts.push(queryToMongo(a,options));
			});

			parts = parts.filter(function(p){
				return !!p;
			});

			if (parts.length<1){
				return {}
			}

			if (parts.length==1) {
				return parts[0]
			}
		
			return {"$or": parts}
		}],

		["eq", function(query, options){
			//console.log("eq() handler: ", query);
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
			//var val = decodeURIComponent(parts[1]);
			var val = parts[1];
			var field = parts[0];
			var out = {};
			out[field]=val;
			return out;
		}],

		["ne", function(query, options){
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
                        var val = parts[1];
                        var field = parts[0];
			var out={};
			out[field]={"$ne":val};
			return out;	
		}],
	
		["exists", function(query, options){
			var out ={};
			out[query.args[0]]={"$exists": true}
			return out;
		}],
		["empty", function(query, options){
			var out ={};
			out[query.args[0]]={"$exists": false}
			return out;
		}],

		["ge", function(query, options){
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
                        var val = parts[1];
                        var field = parts[0];
			var out={};
			out[field]={"$gte":val};
			return out;	
		}],
		["gt", function(query, options){
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
                        var val = parts[1];
                        var field = parts[0];
			var out={};
			out[field]={"$gt":val};
			return out;	
	
		}],
		["le", function(query, options){
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
                        var val = parts[1];
                        var field = parts[0];
			var out={};
			out[field]={"$lte":val};
			return out;	
	
		}],
		["lt", function(query, options){
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
                        var val = decodeURIComponent(parts[1]);
                        var field = parts[0];
			var out={};
			out[field]={"$lt":val};
			return out;	
		}],


		["not", function(query, options){
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
                        var val = parts[1];
                        var field = parts[0];
			var out={};
			out[field]={"$not":val};
			return out;	
		}],

		["elemMatch", function(query, options){
			var parts = [query.args[0]]
			var val;
			var out={};
                        var field = parts[0];
			//console.log("query.args[1]: ", query.args[1]);
			if (typeof query.args[1]=="object"){
				val = queryToMongo(query.args[1],options);
				out[field]={"$elemMatch":val};
			}else{
	                        val = query.args[1];
				out[field]=val; //{"$elemMatch":val};
			}
			return out;	
		}],



		["in", function(query, options){
			var parts = [query.args[0]]
			parts.push(queryToMongo(query.args[1],options));
                        var val = parts[1];
                        var field = parts[0];
			var out={};
			out[field]={"$in":val};
			return out;	
		}],

		["distinct", function(query, options){
		//	if (!options.distinct){
		//		options.distinct=[]
		//	}

			options.distinct=query.args[0];
		}],

		["values", function(query, options){
			options.values = query.args[0];
			return;
		}],

		["select", function(query, options){
			options.fields = options.select= query.args.map(decodeURIComponent);
		}],

		["sort", function(query, options){
			var sort = {}	
			query.args.forEach(function(a){
				var fc = a.charAt(0)
				var dir = 1;
				var field;
				if (fc=="+") {
					dir = 1;
					field = a.substr(1);
				}else if (fc=="-"){
					dir = -1;
					field = a.substr(1);
				}else{
					dir = 1;
					field=a;
				}
			
				sort[field]=dir;	
			});

			options.sort = sort;	

			return;	
		}],

		["limit", function(query, options){
			// we calculate limit(s) combination
			var args = query.args;
			options.lastSkip = options.skip;
			options.lastLimit = options.limit;
			// TODO: validate args, negative args
			//console.log("limit args: ", args);
			var l = args[0] || Infinity, s = args[1] || 0;
			//console.log("l: ", l, "s: ", s);
			// N.B: so far the last seen limit() contains Infinity
			options.totalCount = args[2];
			if (l <= 0) l = 0;
			if (s > 0) options.skip += s, options.limit -= s;
			if (l < options.limit) options.limit = l;
			//console.log("Options after limit: ", options);
			return;
		}],

		["join", function(query,options){
			var args = query.args;
			options.join = [{
				$match: queryToMongo(args[0])
			},{
				$lookup: {from: args[1],localField: args[2],foreignField: args[3], as: "_JOINED_"}
			},{
				$replaceRoot: {newRoot: {$mergeObjects:[{$arrayElemAt: ["$_JOINED_",0]},"$$ROOT"]}}
			}]

			if (args[4]){
				options.join.push({$match: queryToMongo(args[4])})
			}
			//console.log("Join Query: ", options.join);
		}]

]	
var _handlerMap={}
handlers.forEach(function(h){
	_handlerMap[h[0]]=h[1];
});

