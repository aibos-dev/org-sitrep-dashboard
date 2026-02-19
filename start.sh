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

# Support environment variables as primary config source (for Render/cloud deploys)
# Falls back to config.json for local development
if [ -z "$GH_TOKEN" ] && [ -z "$GITHUB_OWNER" ]; then
    if [ ! -f "$SCRIPT_DIR/config.json" ]; then
        echo "Warning: config.json not found and no environment variables set."
        echo "Please either:"
        echo "  - Copy config.sample.json to config.json and configure it"
        echo "  - Set GH_TOKEN and GITHUB_OWNER environment variables"
    fi
fi

# Ensure reports directory exists
mkdir -p "$SCRIPT_DIR/reports"

# Start the server
cd "$SCRIPT_DIR/dashboard"
python3 server.py
