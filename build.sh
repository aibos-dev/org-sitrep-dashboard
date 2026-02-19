#!/bin/bash
#
# Render build script
# Installs system dependencies as standalone binaries (Render has a read-only root filesystem).
#

set -e

BIN_DIR="$(pwd)/bin"
mkdir -p "$BIN_DIR"

echo "=== Installing system dependencies ==="

# Install jq (standalone binary)
echo "Installing jq..."
curl -fsSL -o "$BIN_DIR/jq" https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64
chmod +x "$BIN_DIR/jq"
echo "  jq installed: $($BIN_DIR/jq --version)"

# Install GitHub CLI (standalone tarball)
echo "Installing GitHub CLI..."
GH_VERSION="2.63.2"
curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" -o /tmp/gh.tar.gz
tar -xzf /tmp/gh.tar.gz -C /tmp
cp "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" "$BIN_DIR/gh"
chmod +x "$BIN_DIR/gh"
rm -rf /tmp/gh.tar.gz /tmp/gh_${GH_VERSION}_linux_amd64
echo "  gh installed: $($BIN_DIR/gh --version | head -1)"

# Install Python dependencies
if [ -f requirements.txt ]; then
    pip install -r requirements.txt
fi

# Ensure reports directory exists
mkdir -p reports

echo ""
echo "=== Build complete ==="
echo "Binaries installed to: $BIN_DIR"
