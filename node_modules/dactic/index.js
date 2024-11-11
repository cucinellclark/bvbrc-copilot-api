var debug = require("debug")("dactic");
var express = require('express');
var router = express.Router();
var URL = require("url");
var querystring = require("querystring");
var bodyParser = require("body-parser");
var findBestMedia = require("./media").findBestMedia;
var findDeserializer = require("./media").findDeserializer;
var when = require("promised-io/promise").when;
var All = require("promised-io/promise").all;
var ReadStream = require("stream").Readable;

var middleware = [
	// Parse the query string, extract http_* parameters to set as headers
	// set req.query to the resultant unparsed querystring
	function(req,res,next){
		var url = URL.parse(req.originalUrl,false,false); 

		if (url.query) {
			var parsed = querystring.parse(url.query);
			Object.keys(parsed).forEach(function(key){
				if (key.match("http_")) {
					var header = key.split("_")[1];
					req.headers[header] = parsed[key];
					var regex = new RegExp("[&]" + key + "=" + parsed[key]);
					url.query = url.query.replace(regex,"");
				}
			});
			req.query = url.query; 
		}else{
			req.query="";
		}

		next();
	},

	function(req,res,next){
		if (!req.apiPrivilegeFacet) {
			req.apiPrivilegeFacet="public";
		}
		next();
	}
]


serializationMiddleware = [
	function(req,res,next){
                var meta = res.results.getMetadata();
                if (res.results && meta){
                        if (typeof meta.totalCount != "undefined"){
                                var start = meta.start || 0;
                                var count = meta.count || res.results.getData().length;
				var end = res.results.metadata.end || (start + count -1);
                                var total = meta.totalCount || 0;
                                res.set({
                                        "content-range": "items " + start + "-" + end + "/" + total
                                });
                        }

                }
		next();
	},
	function(req,res,next){
		if (res.results) {
			res.media = findBestMedia(req.headers.accept || "text/json",res.results,{req:req,res:res});	
		
			res.set("content-type",res.media['content-type']);
			debug("Serialize to ", res.media['content-type'], "Metadata: ", res.results.metadata);
			var serialized = res.media.serialize(res.results, {req:req,res:res});
			
			when(serialized, function(out) {
				if (req.headers && req.headers.download){
					var parts = res.media['content-type'].split("/")
					var ext = parts[parts.length-1];
					var filename = (req.templateId || req.apiModel ||  "export") + (ext?("." + ext):"");
					res.set({
						'Content-Disposition': 'attachment; filename=' + filename
					});
				}

				if ((out instanceof ReadStream) || (out && out.stream)){
					out.pipe(res);
				}else{
					res.end(out);
				}
			}, function(err){
				console.log("Error in serializer: ", err);
				next(err);
			});
		}else{
			debug("No Results Found.");
			next("route");		
		}
	}
]

module.exports = function(dataModel){

	router.use(middleware);

	router.get('/resource/schema/:id', [
                function(req,res,next){
                        debug("req.apiPrivilegeFacet: ", req.apiPrivilegeFacet);
                        debug("Model: ", req.params.id);

                        if (req.apiPrivilegeFacet && req.apiPrivilegeFacet!="model" && dataModel.privilegeFacet[req.params.id] && dataModel.privilegeFacet[req.params.id][req.apiPrivilegeFacet]){
                                req.schemaProvider = dataModel.privilegeFacet[req.params.id][req.apiPrivilegeFacet];
                        }else {
                                req.schemaProvider = dataModel.model[req.params.id];
                        }

                        next();
                },
		function(req,res,next){
			req.templateId = "schema";
			debug("req.params: ", req.params);
			if (req.params.id) {
				var model = dataModel.model[req.params.id];
				if (model) {
					debug("Get Model Schema: " + req.params.id);
					when(req.schemaProvider.getSchema(),function(schema){
						res.results={results: schema, metadata:{}};
						next();
					}, function(err){
						console.error("Error Retrieving Schema for " + req.params.id);
						next(err);
					});	
				}else{
					console.error("Invalid Model when trying to retrieve schema " + req.params.id);
					next("route");
				}
			}
		},
		serializationMiddleware

	]);

	router.get('/resource/schema', [
		function(req,res,next){
			req.templateId = "schema";
			req.templateStyle="list"
			var schemas=[]

			var defs = Object.keys(dataModel.model).map(function(modelId){
				var model = dataModel.model[modelId];
                              	var schemaProvider;
                                if (req.apiPrivilegeFacet && req.apiPrivilegeFacet!="model" && dataModel.privilegeFacet[modelId] && dataModel.privilegeFacet[modelId][req.apiPrivilegeFacet]){
                                        schemaProvider = dataModel.privilegeFacet[modelId][req.apiPrivilegeFacet];
                                }else {
                                        schemaProvider = dataModel.model[modelId];
                                }


				return when(schemaProvider.getSchema(),function(schema){
					schemas.push(schema);
					return true;	
				}, function(err){
					return false;
				});	

			});

			when(All(defs), function(){
				var url = URL.parse(req.originalUrl,false,false); 
				
				var schema = {
					id: req.protocol + "://" + req.host + (req.port?(":"+req.port):"") + url.pathname + "#",
					description: "Root API Schema"
				}	
				schemas.forEach(function(s){
					schema[s.title] = s;
					s.id = "#" + s.title;
				});
				res.results={results: schema, metadata:{}};
				next();
			},function(err){
				debug("Error Retrieving Schema: ", err);
				next(err);
			});
		},
		serializationMiddleware

	]);

	router.get('/resource/smd/:id', [
		function(req,res,next){
			debug("req.apiPrivilegeFacet: ", req.apiPrivilegeFacet);
			debug("Model: ", req.params.id);

			if (req.apiPrivilegeFacet && req.apiPrivilegeFacet!="model" && dataModel.privilegeFacet[req.params.id] && dataModel.privilegeFacet[req.params.id][req.apiPrivilegeFacet]){
				req.smdProvider = dataModel.privilegeFacet[req.params.id][req.apiPrivilegeFacet];
			}else {
				req.smdProvider = dataModel.model[req.params.id];
			}

			next();	
		},
		function(req,res,next){
			req.templateId = "smd";
			if (req.params.id) {
				var model = dataModel.model[req.params.id];
				if (model) {
					when(req.smdProvider.getServiceDescription(),function(smd){
						smd.target = "/" + req.params.id;
						res.results={results: smd, metadata:{}};
						next();
					}, function(err){
						console.error("Error Retrieving Service Mapping Description for " + req.params.id);
						next(err);
					});	
				}else{
					console.error("Invalid Model when trying to retrieve SMD" + req.params.id);
					next("route");
				}
			}
		},
		serializationMiddleware

	]);

	router.get('/resource/smd', [
		function(req,res,next){
			next();
		},
		function(req,res,next){
			req.templateId = "smd";
			var SMD = {
				transport: "RAW_POST",
				envelope: "JSON-RPC-2.0",
				contentType: "application/json"	,
				target: "/"
			}
	
			var smds={}

			var defs = Object.keys(dataModel.model).map(function(modelId){
				var smdProvider;
	                        if (req.apiPrivilegeFacet && req.apiPrivilegeFacet!="model" && dataModel.privilegeFacet[modelId] && dataModel.privilegeFacet[modelId][req.apiPrivilegeFacet]){
					smdProvider = dataModel.privilegeFacet[modelId][req.apiPrivilegeFacet];
				}else {
					smdProvider = dataModel.model[modelId];
				}

				return when(smdProvider.getServiceDescription(),function(smd){
					smds[modelId]=smd;

					if (!smd.target || !smd.target.match("/")){
						smds[modelId].target = modelId;	
					}
			
					Object.keys(SMD).forEach(function(key) { if (smds[modelId][key] == SMD[key]) { delete smds[modelId][key]; } });
				
					return true;	
				}, function(err){
					return false;
				});	

			});

			when(All(defs), function(){
				var url = URL.parse(req.originalUrl,false,false); 

				var smd = {
					transport: "RAW_POST",
					envelope: "JSON-RPC-2.0",
					contentType: "application/json"	,
					target: "/",
					services: smds
				}
	
				res.results={results: smd, metadata:{}};
				next();
			},function(err){
				debug("Error Retrieving SMD: ", err);
				next(err);
			});
		},
		serializationMiddleware

	]);


	router.get('/:model/:id', [
		function(req, res,next) {
			req.apiModel = req.params.model;
			req.templateId = req.apiModel;
			req.apiMethod = "get";
			req.apiParams=[req.params.id];
			req.apiOptions = querystring.parse(req.query);
			console.log("GET /:model/:id Template: ", req.templateId);
			next();	
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	router.get('/:model/', [
		function(req,res,next){
			//("Query Route");
			req.apiModel = req.params.model;
			req.templateId = req.apiModel;
			req.templateStyle = 'list';
			req.apiMethod="query";
			debug("req.query: ", req.query);
			req.apiParams=req.query?[req.query]:[];
			req.apiOptions = {};
			console.log("QUERY/:model/ Template: ", req.templateId, req.templateStyle, req.apiParams);
			//("Query /:model/", req.params.model, req.templateId, req.templateStyle, req.apiParams);
			next();
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	router.post("/:model/:id", [
		function(req,res,next){
			next();
		},
		bodyParser.json({limit:"10mb",type: "application/json-patch+json"}),
		function(req,res,next){
			req.apiModel = req.params.model;
			req.apiMethod="patch";
			req.apiParams = [req.params.id,req.body]
			req.apiOptions = {};
			next();
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	router.patch("/:model/:id", [
		function(req,res,next){
			next();
		},
		bodyParser.json({limit:"10mb",type: "application/json-patch+json"}),
		function(req,res,next){
			req.apiModel = req.params.model;
			req.apiMethod="patch";
			req.apiParams = [req.params.id,req.body]
			req.apiOptions = {};
			next();
		},
		dataModel.middleware,
		serializationMiddleware
	]);


	router.post("/:model[/]", [
		function(req,res,next){
			next();
		},
		function(req,res,next){
			if (req.headers && req.headers["content-type"]) {
				var deserializer = findDeserializer(req.headers["content-type"]);
				if (!deserializer) {
					return next("route");
				}
				req.apiModel = req.params.model;
				req.apiMethod = "post"
				req.apiParams = deserializer(req);

				next();
			}else{
				next("route");		
			}
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	router.post('/:model[/]',[
		function(req,res,next){
			next();
		},
		bodyParser.urlencoded({extended: false}),
		bodyParser.json({limit: 20000, type: ["application/jsonrpc+json","application/jsonrequest"]}),
		bodyParser.json({limit: 20000}),
		function(req,res,next) {
			//("DME post /:model/", req.body);	
			req.apiModel = req.params.model;
			if (req.body.jsonrpc){
				req.headers.accept="application/json+jsonrpc";
				debug("req.body: ", JSON.stringify(req.body),req.headers);
				if (req.body.method) {
					req.apiMethod=req.body.method;
					req.apiParams = req.body.params || [];
					req.apiOptions = {}
				}else{
					next(Error("Missing JSONRPC Method"));
				}
			}else{
				req.apiMethod="post";
				req.apiParams = req.body;
				req.apiOptions = {};
			}

			next();
		},
		dataModel.middleware,
		serializationMiddleware
	]);

	router.put("/:model/:id", [
		bodyParser.json({limit: 20000}),
		dataModel.middleware
	]); 

	router["delete"]("/:model/:id", [
                function(req, res,next) {
                        req.apiModel = req.params.model;
                        req.apiMethod = "delete";
                        req.apiParams=[req.params.id];
                        console.log("DELETE /:model/:id Template: ", req.templateId);
                        next();
                },
		dataModel.middleware,
		serializationMiddleware
	]); 



	return router;
}

