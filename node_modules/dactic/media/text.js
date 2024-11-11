var addMedia = require("../media").addMedia;

var media = {
        "content-type": "text/plain",
        serialize: function(results,options){
                return JSON.stringify(results,null,4);
        }       
}

addMedia(media);

module.exports=media;
