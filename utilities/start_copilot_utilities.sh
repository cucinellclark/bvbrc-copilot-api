#!/bin/bash

# Navigate to project directory
cd /home/ac.cucinell/bvbrc-dev/Copilot/bvbrc-copilot-api/utilities

# Activate the virtual environment
source /home/ac.cucinell/bvbrc-dev/Copilot/startup_scripts/copilot_utils_env/bin/activate 

# Start the Flask server
python3 server.py

