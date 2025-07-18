module.exports = {
  apps: [
    {
      name: "copilot-utilities",
      script: "/home/ac.cucinell/bvbrc-dev/Copilot/BV-BRC-Copilot-API/utilities/start_copilot_utilities.sh",
      interpreter: "/bin/bash",
      exec_mode: "fork",
      autorestart: true
    }
  ]
};

