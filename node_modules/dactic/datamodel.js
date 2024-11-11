var debug = require("debug")("dactic:datamodel");
var util = require("util");
var events = require("events");
var when = require("promised-io/promise").when;
var Query = require("rql/query").Query;

function DataModel(options) {
	events.EventEmitter.call(this);
	this.model = {}
	this.middleware = [];
	this.privilegeFacet = {};
	this.options = options;
	var self=this;

	this.use(function(req,res,next){
		if (!req.apiModel ) { //|| !self.model[req.apiModel]){
			throw Error("Missing API Method");
		}
		next();
	});

	this.use(function(req,res,next){
		var start,end,limit;
		var maxCount=Infinity;
		if (req.apiMethod=="query"){

			var model = self.model[req.apiModel];
			if (!model) { return next("route"); }

			debug('self.model: ', self.model);
			maxCount = model.maxLimit;

			debug("model.maxLimit: ", maxCount);
			debug("model.defaultLimit: ", model.defaultLimit);

                        if (req.headers.range) {
                                var range = req.headers.range.match(/^items=(\d+)-(\d+)?$/);
				debug("range: ", range, req.headers.range);
                                if (range) {
                                        start = range[1] || 0;
                                        end = range[2];
                                        end = (end !== undefined) ? end : Infinity;
			
                                        if (end && (end !== Infinity) && (typeof end != "number")) {
                                                end = parseInt(end);
                                        }
                                        if (start && typeof start!= "number") {
                                                start= parseInt(start);
                                        }

                                        // compose the limit op
                                        if (end > start) {
                                                requestedLimit = Math.min(maxCount, (end  - start)+1);
                                                // trigger totalCount evaluation
                                        }else if (end==start){
                                                requestedLimit=1
                                        }

					if (!requestedLimit) { requestedLimit=model.defaultLimit; }

					req.limit = {count: requestedLimit, start: start}
					debug("req.limit: ", req.limit);
				}
			}
			debug("req.apiParams: ", req.apiParams);
			var orig = req.apiParams[0] || "";
			var query = Query(orig);
			debug("Limit Query Check: ", query, orig);
			
			if (query.cache && query.cache.limit) {
				debug("Found Query Limit: ", query.limit);
				if (query.limit > maxCount) {
					throw Error("Query Limit exceeds Max Limit");
				}	
			}else if (req.limit) {
				debug("Found Req.limit: ", req.limit);
				orig+= "&limit(" + req.limit.count+ "," + (req.limit.start?req.limit.start:0) + ")"; 
			}else{
				debug("Adding default ", model.defaultLimit, " to query");
				orig+= "&limit(" + (model.defaultLimit || 25) + ")"; 
			}
			req.apiParams[0]=orig;
			debug("limit query: ", req.apiParams[0])
		}
		next();
	});

	// get the executor
	this.use(function(req,res,next){
		var acl = req.apiPrivilegeFacet || "public";
		var opts = {req: req, res: res}
		debug("Get Executor: ", acl, req.apiModel, req.apiMethod, req.apiParams);
		//console.log("Priv Facet: ", acl, "self.privilegeFacet[req.apiModel] exists ", !!self.privilegeFacet[req.apiModel][acl], "method type: ", typeof self.privilegeFacet[req.apiModel][acl][req.apiMethod] );
		//((typeof self.privilegeFacet[req.apiModel][acl][req.apiMethod]== "boolean" )?("Boolean Facet Method: " + self.privilegeFacet[req.apiModel][acl][req.apiMethod]):"");
		
		//console.log("Model Method: ", self.model[req.apiModel][req.apiMethod]);
		//console.log(" self.privilegeFacet[req.apiModel][acl]: ", self.privilegeFacet[req.apiModel]);
		if (acl!="model" && self.privilegeFacet[req.apiModel] && self.privilegeFacet[req.apiModel][acl] && self.privilegeFacet[req.apiModel][acl][req.apiMethod]){
			req.executor = function(params) {
				params.push(opts);
				debug("call facet executor::", req.apiModel, acl, req.apiMethod, params );
				//("params are array: ", params instanceof Array, "Params: ", params);
				if (self.privilegeFacet[req.apiModel][acl][req.apiMethod] && typeof self.privilegeFacet[req.apiModel][acl][req.apiMethod]=="function"){
					return self.privilegeFacet[req.apiModel][acl][req.apiMethod].apply(self.privilegeFacet[req.apiModel][acl], params);
				}else{
					//("Call Model Executor because of boolean privilege facet prop");
					return self.model[req.apiModel][req.apiMethod].apply(self.model[req.apiModel],params);	
				}
			}
		}else if ((!acl || acl=="model") && self.model[req.apiModel][req.apiMethod]){
			req.executor = function(params){
				params.push(opts);
				debug("call model executor::", req.apiModel, acl, req.apiMethod, params);
				return self.model[req.apiModel][req.apiMethod].apply(self.model[req.apiModel],params);
			}
		}else{
			console.error("Executor not found for : " + req.apiModel + " : " + req.apiMethod);
			next("route");
		}

		next();
	});

	// execute req.executor
	this.use(function(req,res,next){
		debug("Execute req.executor");
		//var opts = {req:req, res:res};
		try {
			if (!(req.apiParams instanceof Array)){
				req.apiParams = [req.apiParams];
			}
			debug("req.apiParams: ", req.apiParams);
			if (!req.executor) {
				debug("Invalid Executor");
				return next(new Error("Not Found"));
			}
			debug("Call Executor", req.apiParams);
			var results = req.executor(req.apiParams);
//			if (!results){
//				next("route");
//			}else{
			//("Results: ", results);
				when(results, function(results){
					//console.log("dataModel results handler results: ", results);
					res.results = results;
					if (req.apiMethod=="query" && results && results.metadata) {
						debug("Results.metadata: ", results.metadata);
						var start = parseInt(results.metadata.start || 0);
						var end = start + ((results && results.results)?results.results.length:0);
						var tr = results.metadata.totalRows;
	
						var cr = "items " + start + "-" + end + "/" + tr; 
						debug("cr: ", cr);
						res.set("Content-Range", cr);
					}
					next();
				}, function(err){
					console.error("Error in results: ", err);
					res.results=false;
					res.error = err;
					next(err);
				});
//			}

		}catch(err){
			debug("Error Executing Model Method: ", err);
			res.error=err;
			next(err);
		}
	});

}

util.inherits(DataModel, events.EventEmitter);

DataModel.prototype.use = function(mw, first){
	if (first) {
		this.middleware.unshift(mw);
	}else{
		this.middleware.push(mw);
	}
}

DataModel.prototype.getMiddleware = function(){
	return this.middleware;
}

DataModel.prototype.set = function(name, model, privilegeFacet) {
	
	this.model[name]=model;
	this.privilegeFacet[name] = privilegeFacet || {};
	this.emit("ModelAdd",{name: name, model: model, privilegeFacet:privilegeFacet})
}

DataModel.prototype.get = function(name) {
	return this.model[name];
}

module.exports = DataModel;
