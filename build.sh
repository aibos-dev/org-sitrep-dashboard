#!/bin/bash
#
# Render build script
# Installs system dependencies required by the dashboard.
#

set -e

echo "=== Installing system dependencies ==="

# Install jq
echo "Installing jq..."
apt-get update -qq && apt-get install -y -qq jq > /dev/null 2>&1
echo "  jq installed: $(jq --version)"

# Install GitHub CLI
echo "Installing GitHub CLI..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update -qq && apt-get install -y -qq gh > /dev/null 2>&1
echo "  gh installed: $(gh --version | head -1)"

# Install Python dependencies (none currently, but future-proofing)
if [ -f requirements.txt ]; then
    pip install -r requirements.txt
fi

# Ensure reports directory exists
mkdir -p reports

echo ""
echo "=== Build complete ==="
