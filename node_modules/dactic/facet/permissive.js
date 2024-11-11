var PrivilegeFacet = require("./privilege");
var util=require("util");


var Facet = module.exports = function(){
	PrivilegeFacet.apply(this,arguments);
}		

util.inherits(Facet,PrivilegeFacet);

Facet.prototype.permissive=true;
