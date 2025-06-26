module.exports = {
  apps: [
    {
      name: "copilot-utilities",
      script: "/home/ac.cucinell/bvbrc-dev/Copilot/start_copilot_utilities.sh",
      interpreter: "/bin/bash",
      exec_mode: "fork",
      autorestart: true
    }
  ]
};

