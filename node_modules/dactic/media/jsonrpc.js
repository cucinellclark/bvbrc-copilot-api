var addMedia = require("../media").addMedia;

addMedia({
	"content-type": "application/json+jsonrpc",
	serialize: function(results,options){
		return JSON.stringify({id: 1,result: results.getData()});
	}
})
