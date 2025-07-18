module.exports = {
  apps : [
  {
    name   : "Copilot-API",
    cwd: "/home/ac.cucinell/bvbrc-dev/Copilot/BV-BRC-Copilot-API",
    exec_mode: "cluster",
    instances: 3,
    cron_restart: "30 4 * * *",
    script : "/home/ac.cucinell/bvbrc-dev/Copilot/BV-BRC-Copilot-API/bin/launch-copilot",
    error_file: "/home/ac.cucinell/bvbrc-dev/Copilot/copilot-logs/p3-web.error.log",
    out_file: "/home/ac.cucinell/bvbrc-dev/Copilot/copilot-logs/p3-web.out.log",
    pid_file: "/home/ac.cucinell/bvbrc-dev/Copilot/copilot-logs/p3-web.pid",
  }
  ]
}
