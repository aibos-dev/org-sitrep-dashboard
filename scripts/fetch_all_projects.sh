#!/bin/bash
#
# Fetch all organization projects from aibos-dev and generate reports for each
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
CONFIG_FILE="${PROJECT_DIR}/config.json"
OUTPUT_DIR="${PROJECT_DIR}/reports"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H-%M-%S)

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: config.json not found. Please create it from config.sample.json"
    exit 1
fi

OWNER=$(jq -r '.github.owner' "$CONFIG_FILE")
GITHUB_TOKEN=$(jq -r '.github.token // empty' "$CONFIG_FILE")

if [ -z "$OWNER" ]; then
    echo "Error: Missing 'owner' in config.json"
    exit 1
fi

# Set up GitHub token
if [ ! -z "$GITHUB_TOKEN" ]; then
    export GH_TOKEN="$GITHUB_TOKEN"
fi

mkdir -p "$OUTPUT_DIR"

echo "=============================================="
echo "  Fetching all projects from: $OWNER"
echo "=============================================="
echo ""

# Delete existing reports first
echo "Cleaning up existing reports..."
rm -f "$OUTPUT_DIR"/sitrep_*.json
rm -f "$OUTPUT_DIR"/projects.json
echo "  Existing reports deleted."
echo ""

# Query to get all organization projects
PROJECTS_QUERY='query($org: String!) {
  organization(login: $org) {
    projectsV2(first: 100) {
      nodes {
        id
        number
        title
        shortDescription
        closed
        items {
          totalCount
        }
      }
    }
  }
}'

echo "Fetching organization projects..."
PROJECTS_DATA=$(gh api graphql -f query="$PROJECTS_QUERY" -f org="$OWNER" 2>&1)

# Check for errors
if echo "$PROJECTS_DATA" | grep -q "error" 2>/dev/null; then
    echo "Error fetching projects:"
    echo "$PROJECTS_DATA" | jq '.errors' 2>/dev/null || echo "$PROJECTS_DATA"
    exit 1
fi

# Extract project list
PROJECTS=$(echo "$PROJECTS_DATA" | jq -r '.data.organization.projectsV2.nodes[] | select(.closed == false) | "\(.number)|\(.title)|\(.items.totalCount)"')

if [ -z "$PROJECTS" ]; then
    echo "No open projects found in organization $OWNER"
    exit 0
fi

echo "Found projects:"
echo "$PROJECTS" | while IFS='|' read -r num title count; do
    echo "  #$num: $title ($count items)"
done
echo ""

# Save project list to JSON for the dashboard
echo "$PROJECTS_DATA" | jq '[.data.organization.projectsV2.nodes[] | select(.closed == false) | {number, title, description: .shortDescription, itemCount: .items.totalCount}]' > "$OUTPUT_DIR/projects.json"

# Process each project in parallel
MAX_PARALLEL=4  # Maximum concurrent jobs
PIDS=()

echo "Processing projects in parallel (max $MAX_PARALLEL concurrent)..."
echo ""

while IFS='|' read -r PROJECT_NUMBER PROJECT_NAME ITEM_COUNT; do
    # Skip empty projects
    if [ "$ITEM_COUNT" -eq 0 ]; then
        echo "  Skipping #$PROJECT_NUMBER: No items"
        continue
    fi

    # Wait if we have too many parallel jobs
    while [ ${#PIDS[@]} -ge $MAX_PARALLEL ]; do
        # Check which jobs have finished
        NEW_PIDS=()
        for pid in "${PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                NEW_PIDS+=("$pid")
            fi
        done
        PIDS=("${NEW_PIDS[@]}")
        [ ${#PIDS[@]} -ge $MAX_PARALLEL ] && sleep 0.5
    done

    # Start project processing in background
    echo "  Starting: #$PROJECT_NUMBER - $PROJECT_NAME"
    bash "$SCRIPT_DIR/generate_project_report.sh" "$PROJECT_NUMBER" "$PROJECT_NAME" &
    PIDS+=($!)

done <<< "$PROJECTS"

# Wait for all remaining jobs to complete
echo ""
echo "Waiting for all projects to complete..."
for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

echo ""
echo "=============================================="
echo "  All project reports generated!"
echo "  Output directory: $OUTPUT_DIR"
echo "=============================================="
