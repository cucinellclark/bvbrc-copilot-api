#!/usr/bin/env node
const debug = require('debug')('p3-user');
const conf = require('../config');
const CSVparser = require('csv-parse')
const MongoClient = require("mongodb").MongoClient
const fs = require('fs');
const through2 = require("through2")
cliProgress = require('cli-progress');

const input_file = conf.get("import");

// ViPR fields    ["USER_ID","FIRST_NAME","LAST_NAME","EMAIL_ID","CREDATE","MODIFICATION_DATE","LAST_LOGIN","PASSWORD",
//                 "DONOTASK_FLG","NO_TOOL_INPUT_LIMIT","INSTITUTION","PASSWD_RESET_CODE","USER_ROLE","INVALID_EMAIL","NAME_OF_PI","TRACKING_ACKNOWLEDGE"],
const field_map = {
	FIRST_NAME: "first_name",
	MIDDLE_NAME: "middle_name",
	LAST_NAME: "last_name",
	EMAIL_ID: "email",
	INSTITUTION: "affiliation",
	CREDATE: "import_creation_date",
	PASSWORD: "password",
	USER_ID: "source_id"
}

if (!input_file) {
	console.error("Missing import file (--import=<file>)")
	process.exit(1)
}

var report = {
	count: 0,
	existing: 0,
	updated: 0,
	update_errors: [],
	create_errors: [],
	created: 0,
	skipped: 0,
	skipped_ids: [],
	updated_ids: [],
	created_ids: [],
}

const importer = (client, progress) => {
	return through2({ objectMode: true, highWaterMark: (1024 * 1024) }, function (row, enc, callback) {
		//console.log("Chunk: ", row);
		if (!row) {
			this.push(null);
			callback()
		}
		progress.update(report.count);
		if (report.count++ > 0 && row) {
			var props = Object.keys(row);
			props.forEach(function (p) {
				if (row[p] === "(null)") {
					row[p] = ""
				}
			});
			import_user(row, client).then((r) => {
				this.push(row);
				callback()
			})
		} else {
			this.push(row)
			callback()
		}
	})
};

console.log(`Importing from ${input_file}`);
var mongoconf = conf.get("mongo");
//console.log("mongoconf: ", mongoconf);

function countFileLines(filePath) {
	return new Promise((resolve, reject) => {
		let lineCount = 0;
		fs.createReadStream(filePath)
			.on("data", (buffer) => {
				let idx = -1;
				lineCount--; // Because the loop will run once for idx=-1
				do {
					idx = buffer.indexOf(10, idx + 1);
					lineCount++;
				} while (idx !== -1);
			}).on("end", () => {
				resolve(lineCount);
			}).on("error", reject);
	});
};

function merge_user_data(user, db_user) {
	return new Promise((resolve, reject) => {
		var update = {}

		user.EMAIL_ID = user.EMAIL_ID.toLowerCase();

		for (const prop in field_map) {
			// console.log(`prop: ${prop} user[prop]: '${user[prop]}' db_user[prop]: '${db_user[field_map[prop]]}'`)
			if (user[prop] && user[prop] !== db_user[field_map[prop]]) {
				update[field_map[prop]] = user[prop]
				console.log(`Add to update: ${prop}`)
			}
		}
		if (Object.keys(update).length > 0) {
			const up = { "$set": update }
			console.log(`Update Object: ${JSON.stringify(up)}`)
			resolve(true)
			return;
		}
		resolve(false)
	});
}

function update_existing(db_user, user) {
	return new Promise((resolve, reject) => {

		//user was already a patricbrc.org user
		if (db_user.source && db_user.source==="patricbrc.org"){
			resolve(false)

		//user has been imported previously, but never logged in
		}else if ((db_user.source_id === user.USER_ID) && db_user.password && !db_user.password.match(/\$2[ab]/)) {
			merge_user_data(user, db_user).then((success) => {
				resolve(success)
			})

		// emails match, but not source_id.  This was a pre-existing user. Do nothing
		} else if ((db_user.email === user.EMAIL_ID.toLowerCase()) && (!db_user.source_id || (db_user.source_id !== user.USER_ID))) {
			// console.log(`Skipping Pre-existing user: ${db_user.id}`)
			resolve(false)
		} else {
			console.log(`Unexpected: db_user.id: ${db_user.id} db_user.email: ${db_user.email} db_user.source_id: ${db_user.source_id} user.USER_ID: ${user.USER_ID} user.EMAIL_ID: ${user.EMAIL_ID}`)
			console.log("db_user: ", JSON.stringify(db_user,null,4))
			console.log("USER: ", JSON.stringify(user,null,4))
			reject(Error(`Update User in unxpected state.  ID: ${db_user.id} Source ID: ${user.USER_ID}`))
		}
	})
}

function generate_id(base_id, client, counter = 0) {
	// console.log(`generate ${base_id} ${counter}`)
	const id = (counter > 0) ? `${base_id}${counter}` : base_id
	var q = { "l_id": id.toLowerCase() };
	return client.findOne(q).then((user) => {
		if (user) {
			return generate_id(base_id, client, counter+1)
		}
		return id
	})
}
function import_new_user(user, client) {
	return new Promise((resolve, reject) => {
		var newuser = {}

		const props = Object.keys(field_map)

		props.forEach((prop) => {
			if (user[prop]) {
				if (prop === "EMAIL_ID") {
					newuser[field_map[prop]] = user[prop].toLowerCase()
				} else {
					newuser[field_map[prop]] = user[prop]
				}
			}
		})

		if (!newuser.email){
			reject(`Missing Email address ${newuser.source_id} ${newuser.email}`)
			return;
		}

		if (!newuser.email.match("@")){
			reject(`Invalid Email address ${newuser.source_id} ${newuser.email}`)
			return;
		}

		if (!newuser.password){
			reject(`Missing Password ${newuser.source_id} ${newuser.email}`)
			return;
		}

		newuser.source = "viprbrc"
		newuser.creationDate = new Date().toISOString()
		newuser.updateDate = new Date().toISOString()
		newuser.updatedBy = "importer"

		if (!newuser.first_name || !newuser.last_name) {
			var parts = newuser.email.split("@");
			if (!newuser.first_name) { newuser.first_name = parts[0] }
			if (!newuser.last_name) { newuser.last_name = parts[1] }
		}

		generate_id(newuser.email.split("@")[0].toLowerCase(), client, 0).then((newid) => {
			newuser.id = newid;
			newuser.l_id = newid.toLowerCase()
			client.insert(newuser).then(()=>{
				resolve(newuser)
			},reject)
			
		})
	});
}

function import_user(user, client) {
	// var q = { $or: [{ email: { $regex: user.EMAIL_ID, $options: "i" } }, { source_id: user.USER_ID }] };
	var q = { $or: [{ email: user.EMAIL_ID.toLowerCase()}, { source_id: user.USER_ID }] };
	var p = client.findOne(q);
	return p.then((db_user) => {
		if (db_user) {
			report.existing++;
			return update_existing(db_user, user).then((updated) => {
				if (updated) {
					report.updated++;
					report.updated_ids.push(db_user.id)
				} else {
					report.skipped_ids.push(db_user.id)
					report.skipped++;
				}
				return user;
			}, (err) => {
				// console.log('Update Error: ', err);
				report.update_errors.push(err)
				return false
			});
		} else {
			return import_new_user(user, client).then((newuser) => {
				report.created++
				report.created_ids.push(newuser.id)
				return newuser;
			}, (err) => {
				report.create_errors.push(err)
				return false
			})
		}
	}, (err) => {
		console.log("Error: ", err);
		return false;
	});
}

function parse_file(client, progress) {
	parser = CSVparser({
		record_delimiter: "\n",
		delimiter: "\t",
		quote: '"',
		trim: true,
		columns: ["USER_ID", "FIRST_NAME", "LAST_NAME", "EMAIL_ID", "CREDATE", "MODIFICATION_DATE", "LAST_LOGIN", "PASSWORD", "DONOTASK_FLG", "NO_TOOL_INPUT_LIMIT", "INSTITUTION", "PASSWD_RESET_CODE", "USER_ROLE", "INVALID_EMAIL", "NAME_OF_PI", "TRACKING_ACKNOWLEDGE"],
	});

	fs.createReadStream(input_file)
		.on('error', (err) => {
			console.log(`Error importing file: ${err}`);
		})
		.pipe(parser)
		.pipe(importer(client, progress))
		.on('finish', () => {
			progress.stop();
			console.log("Import Completed");
			console.log(`Total lines in file: ${report.count} Total Records: ${report.total}`)
			console.log(`Matched Users: ${report.existing}  Updated: ${report.updated}  Skipped: ${report.skipped} Errors: ${report.update_errors.length}`);
			console.log(`Unmatched Users: ${report.total - report.existing}  Created: ${report.created} Errors: ${report.create_errors.length}`);
			// if (report.skipped > 0) {
			// 	console.log(`Skipped IDs: \n\t${report.skipped_ids.join('\n\t')}`)
			// }
			// if (report.update > 0) {
			// 	console.log(`Updated IDs: \n\t${report.updated_ids.join('\n\t')}`)
			// }
			// if (report.created > 0) {
			// 	console.log(`Created IDs: \n\t${report.created_ids.join('\n\t')}`)
			// }
			if (report.update_errors.length > 0) {
				// console.log(`Created IDs: \n\t${report.created_ids.join('\n\t')}`)
				console.log(`Update Errors:\n\t${report.update_errors.join('\n\t')}`)
			}
			if (report.create_errors.length > 0) {
				// console.log(`Created IDs: \n\t${report.created_ids.join('\n\t')}`)
				console.log(`Created Errors:\n\t${report.create_errors.join('\n\t')}`)
			}
			process.exit(0);
		})
}

(() => {
	if (mongoconf && mongoconf.url) {
		console.log("Creating MongoClient client @ " + mongoconf.url);
		var client = MongoClient.connect(mongoconf.url, {})
			.catch(err => { console.log(err); process.exit(1); })
		client.then((client) => {
			const parts = mongoconf.url.split("/");
			const db_name = parts[parts.length - 1];
			const db = client.db(db_name).collection("user");
			countFileLines(input_file).then((c) => {
				report.total = c - 1
				const progress = new cliProgress.SingleBar({clearOnComplete:true});
				progress.start(report.total)
				parse_file(db, progress)
			});
		})
	} else {
		console.error("Missing MongoDB configuration");
		process.exit(1)
	}
})()
