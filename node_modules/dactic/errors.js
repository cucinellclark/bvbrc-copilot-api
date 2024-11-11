
var errorCodes = [
	[400, "Bad Request","BadRequest"],
	[401, "Unauthorized"],
	[402, "Payment Required","PaymentRequired"],
	[403, "Forbidden"],
	[404, "Not Found", "NotFound"],
	[405, "Method Not Allowed", "MethodNotAllowed"],
	[406, "Not Acceptable", "NotAcceptable"],
	[407, "Proxy Authentication Required", "ProxyAuthenticationRequired"],
	[408, "Request Timeout", "RequestTimeout"],
	[409, "Conflict"],
	[410, "Gone"],
	[412, "Precondition Failed","PreconditionFailed"],
	[413, "Request Entity Too Large","RequestEntityTooLarge"],
	[414, "Request URI Too Long","RequestURITooLong"],
	[415, "Unsupported Media Type","UnsupportedMediaType"],
	[416, "Requested Range Not Satisfiable","RequestedRangeNotSatisfiable"],
	[417, "Expectation Failed", "ExpectationFailed"],
	[500, "Internal Server Error", "InternalServerError"],
	[501, "Not Implemented", "NotImplemented"],
	[503, "Service Unavailable", "ServiceUnavailable"]
]


errorCodes.forEach(function(c){
	exports[c[2]||c[1]]=function(msg){
		//Error.call(this,msg);
		var err = new Error(msg);

		err.status=c[0];
		err.name=c[1];
//		Error.call(this,msg);
//		Error.captureStackTrace(this, arguments.callee);
//		this.toString = function(){return msg + " (" + this.name + ") "}
//		err.captureStackTrace(this,arguments.callee);
		return err;
	}
});
 
