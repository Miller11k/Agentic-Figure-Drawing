#!/bin/bash
set -e

# Start the Python API
cd /app/Backend
. venv/bin/activate
python3 app.py &

# Start nginx in the foreground
nginx -g "daemon off;"