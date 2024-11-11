module.exports = {
  apps : [{
		name   : "p3_user",
		script : "./app.js",
		cwd: "/p3_user",
		instances: 1,
		exec_mode: "cluster",
		log_file: "/logs/p3_user.log",
		error_file: "NULL",
		out_file: "NULL",
		combine_logs: true,
		kill_timeout : 10000
	}]
}

