#!/bin/bash
#
# Start the Organization SitRep Dashboard
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Organization SitRep Dashboard..."
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed."
    exit 1
fi

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "Warning: GitHub CLI (gh) not found. Report generation will fail."
    echo "Install with: sudo apt install gh"
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Warning: jq not found. Report generation will fail."
    echo "Install with: sudo apt install jq"
fi

# Check config exists
if [ ! -f "$SCRIPT_DIR/config.json" ]; then
    echo "Warning: config.json not found."
    echo "Please copy config.sample.json to config.json and configure it."
fi

# Fetch initial data before starting the server
echo "Fetching initial project data..."
if [ -f "$SCRIPT_DIR/scripts/fetch_all_projects.sh" ]; then
    bash "$SCRIPT_DIR/scripts/fetch_all_projects.sh"
    echo "Initial data fetch complete."
else
    echo "Warning: fetch_all_projects.sh not found. Starting without initial data."
fi

# Start the server
cd "$SCRIPT_DIR/dashboard"
python3 server.py
