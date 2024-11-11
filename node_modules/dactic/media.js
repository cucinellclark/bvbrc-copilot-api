var MediaHandlers=[];
var debug = require("debug")("dactic:media");

module.exports.addMedia = function(media){
	debug("Add Media: ", media, typeof media);
	MediaHandlers.push(media)
}

module.exports.findDeserializer=function(type){
	var deserializer;

	if (MediaHandlers.some(function(h){
		if ((h["content-type"]==type) && h.deserialize){
			deserializer=h.deserialize;
			return true;
		}
	})) {
		return deserializer;
	}else{
		return false;
	}
		
}
module.exports.findBestMedia = function(type,results,options){
	var parts= type.split(";");
	var accepts = {};
	parts.forEach(function(acc){
		debug("accepts: ", acc);
		var types=acc.split(",").map(function(s){ return s.trim() });
		if (!(types instanceof Array)){
			types=[types];
		}
		var qscore;
		types = types.filter(function(t){
			debug("t: ", t);
			if (t.match("q\=")){
				qscore=t.split("=")[1];
				return false;
			}
			return true;
		});
		if (!qscore) { qscore="1" };
		debug("Set qscore: ", qscore, types);
                if (!accepts[qscore]){
                        accepts[qscore]=[];
                }
                accepts[qscore]=accepts[qscore].concat(types);
	});

	debug("accept types: ", accepts);

	var media;
	var matchConf=0;
	debug("Find Best Media: ", type);
	MediaHandlers.some(function(m){
		if (m.checkMedia){
			var conf = m.checkMedia(type,results,options);
			if (conf > matchConf){
				media=m;
				matchConf=conf;
			}
		}else {
			Object.keys(accepts).some(function(qscore){
				debug("Checking accepts with qscore: ", qscore,m['content-type'], "Match: ", accepts[qscore].indexOf(m['content-type']) );
				if (accepts[qscore].some(function(t){
					debug("compare: >" + t + "< >" + m['content-type'] + "<");
					return t == m['content-type'];
				})){ 
					debug("Matched Qscore: ", qscore);
					if (parseFloat(qscore)>matchConf){
						matchConf=parseFloat(qscore);
						media=m;
					}
				}	
				/*
				if (accepts[qscore].indexOf(m['content-type'])!=-1){
					debug("Found match: ", qscore, accepts[qscore], m['content-type']);
		
					if (parseFloat(qscore)>matchConf){
						matchConf=parseFloat(qscore);
						media=m;
					}
					return true;
				}
				*/
			});
		}

		if (matchConf==1){
			return true;
		}
	});

	debug("Matched Media: ", media, matchConf);
	return media;
}
