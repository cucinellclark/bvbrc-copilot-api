#!/usr/bin/env node
const debug = require('debug')('p3-user');
const conf = require('../config');
const MongoClient = require("mongodb").MongoClient
mongoconf = conf.get("mongo")
console.error("This was a one time import script, do not use without thinking through what it does")
process.exit(1)
if (mongoconf && mongoconf.url) {
	console.log("Creating MongoClient client @ " + mongoconf.url);
	var client = MongoClient.connect(mongoconf.url, {})
		.catch(err => { console.log(err); process.exit(1); })
	client.then(async (client) => {
		db = client.db("p3_user");
		users = db.collection("user");
		// console.log("users: ", users);
		try {
			var total=await users.estimatedDocumentCount();
			console.log(`Total Users: ${total}`)
			var timestamp = new Date().toISOString()
			var q = {password: {$exists: true, "$ne": ""}};
			var matchCount = await users.countDocuments(q)
			console.log("Matching Documents: ", matchCount)
			results = await users.updateMany(q,{"$set": {
				"email_verified": true,
				"verification_date": timestamp,
				"verification_code": "",
				"verification_send_date": "",
				"reverification": false
			}})
			console.log(`Update Results - Matched Count: ${results.matchedCount} Modified: ${results.modifiedCount}`)
			return true;
		} finally {
			await client.close()
		}
	})
	.catch((err)=>{
		console.log("Error: ", err)
	})
} else {
	console.error("Missing MongoDB configuration.  Run this script from the repo root.");
	process.exit(1)
}

