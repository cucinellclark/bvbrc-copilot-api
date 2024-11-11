var ReadStream = require("stream").Readable;
var util = require("util");
var def = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var All = require("promised-io/promise").all;
var fs = require('fs');
var stripeof = require("strip-eof");

function walk(data,defs){
	var out = [];
	if (!defs){ defs=[]; }

	if (data instanceof Array){
		out.push("[");

		data.forEach(function(d,index){
			out.push(walk(d));
			if (index < (data.length-1)){
				out.push(", ");
			}
		},this)	

		out.push("]");
	} else if  (data && ((data instanceof ReadStream) ||(data.stream)) ) {//((typeof data=="object") && data.read && (typeof data.read == "function")){
		out.push('"');
		out.push(data); 
		out.push('"');
	}else if (typeof data == "object"){
		out.push("{");
		var keys = Object.keys(data)
		keys.forEach(function(key,index){
			out.push('"' + key + '": ');
			out.push(walk(data[key]))
			if (index<(keys.length-1)) {
				out.push(", ");
			}	
		});
		out.push("}");
	}else{
		out.push(JSON.stringify(data));
	}

	return when(All(out),function(results){
		return results;
	});
}

function popElement(data){
	var elem;
	if (data[0] instanceof Array){
		//console.log("data[0] is array");
		if (data[0].length>0){
			//console.log("POP Data[0] Element");
			var elem = popElement(data[0]);
			return elem;
		}else{
			//console.log("Data[0] Element empty, shift off");
			data.shift();
			return popElement(data);	
		}
	} else if (data[0] && ((data[0] instanceof ReadStream)||(data[0].stream))) { //(data[0] && data[0].read && (typeof data[0].read =="function")){
		//console.log("Popped ReadStream");
		return data.shift();
	}else if (typeof data[0] != "undefined"){
		//console.log("data [0]", data[0]);
		return data.shift();
	}
}

function JsonStringifier(data,options){
	ReadStream.call(this,options);
	var _self=this;
	//this.data// = walk(data), function(results){
	//	_self.data = results;
	//	return results;
	//});;
};



util.inherits(JsonStringifier,ReadStream);



JsonStringifier.prototype._read= function(size){
	var data = this.data;
	var _self=this;

	if (_self.curStream){
		_self.curStream.resume();
		return;
	}

	if (data) {
		when(data, function(data){
			var elem = popElement(data);
			if (elem && ((elem instanceof ReadStream)||(elem.stream))){ //(elem && elem.read && (typeof elem.read=="function")){
				_self.curStream = elem;
				_self.curStream.on("data", function(chunk){
					console.log("Pause curStream");
					_self.curStream.pause();
					_self.push(stripeof(chunk));
				});

				_self.curStream.on('end', function(){
					delete _self.curStream;
					_self._read(size);
				});
			}else if (elem){
				_self.push(elem);
			}else{
				_self.push(null);
			}
		});
	}else{
		this.push(null);
	}
}

module.exports=JsonStringifier;

/*
var textStream = fs.createReadStream("/tmp/testFile.txt");
//var textStream="BLAH"

var stream = new JsonStringifier([{id: 1, text: textStream},{id:2}],{});

var buffer = [];
tream.on("data", function(chunk){
	buffer.push(chunk);
})

stream.on('end', function(){
	console.log("OUTPUT: ", buffer.join(""));
});
*/
