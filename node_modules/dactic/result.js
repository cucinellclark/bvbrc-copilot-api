var debug = require("debug")("dactic:model")
var errors = require("./errors");
var when = require("promised-io/promise").when;
var defer = require("promised-io/promise").defer;
var EventEmitter = require('events').EventEmitter;
var util=require("util");

var Result = module.exports =  function(data,metadata){
	EventEmitter.call(this);
	this.data = undefined;
	this.metadata = {}

	if (data){
		this.setData(data);
	}

	if (metadata){
		this.setMetadata(metadata);
	}
}

util.inherits(Result, EventEmitter);

Result.prototype.getData = function(){
	return this.data;
}

Result.prototype.forEach = function(fn,scope){
	if (this.data instanceof Array){
		this.data.forEach(fn,scope)
	}else{
		[this.data].forEach(fn,scope);
	}
}

Result.prototype.getMetadata = function(){
	return this.metadata
}

Result.prototype.setData = function(data){
	this.data = data
}

Result.prototype.setMetadata = function(meta){
	Object.keys(meta).forEach(function(key){
		this.metadata[key] = meta[key];
	},this)
}
