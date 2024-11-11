var addMedia = require("../media").addMedia;
var Result = require("../result");
addMedia({
	"content-type": "application/json",
	serialize: function(results,options){
		if (results instanceof Result){
			results = results.getData();	
			return JSON.stringify(results);
		}

		if (!results){
			results=""
		}

		try {
			return JSON.stringify(results.results || results);
		}catch(err){
			console.log("Unable to create JSON: ", err);
		}
	}
})



addMedia({
	"content-type": "text/json",
	serialize: function(results,options){
		var metadata;
		if (results instanceof Result){
			results = results.getData();	
			return JSON.stringify(results,null,4);
		}

		if (!results){
			results=""
		}

		return JSON.stringify(results.results || results, null, 4);
	}
})


