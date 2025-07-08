#!/bin/bash

# Activate the virtual environment
source ./copilot_utils_env/bin/activate 

## Start the Flask server
#python3 server.py
gunicorn --bind 0.0.0.0:5000 server:app

