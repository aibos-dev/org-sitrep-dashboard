#!/bin/bash
#
# Generate SitRep report for a single project
# Usage: ./generate_project_report.sh <project_number> <project_name>
#

set -e

PROJECT_NUMBER="$1"
PROJECT_NAME="$2"

if [ -z "$PROJECT_NUMBER" ] || [ -z "$PROJECT_NAME" ]; then
    echo "Usage: $0 <project_number> <project_name>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
CONFIG_FILE="${PROJECT_DIR}/config.json"
OUTPUT_DIR="${PROJECT_DIR}/reports"
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H-%M-%S)

# Support environment variables with fallback to config.json
OWNER="${GITHUB_OWNER:-}"
TOKEN="${GH_TOKEN:-}"

if [ -f "$CONFIG_FILE" ]; then
    [ -z "$OWNER" ] && OWNER=$(jq -r '.github.owner // empty' "$CONFIG_FILE")
    [ -z "$TOKEN" ] && TOKEN=$(jq -r '.github.token // empty' "$CONFIG_FILE")
fi

if [ -n "$TOKEN" ]; then
    export GH_TOKEN="$TOKEN"
fi

mkdir -p "$OUTPUT_DIR"

# Sanitize project name for filename
SAFE_NAME=$(echo "$PROJECT_NAME" | tr ' ' '_' | tr -cd '[:alnum:]_-')
REPORT_FILE="$OUTPUT_DIR/sitrep_${SAFE_NAME}_${DATE}_${TIME}.json"

echo "  Fetching items from project #$PROJECT_NUMBER..."

# Fetch items with pagination
ALL_ITEMS="[]"
HAS_NEXT_PAGE=true
CURSOR=""
PAGE_COUNT=0

while [ "$HAS_NEXT_PAGE" = "true" ]; do
    PAGE_COUNT=$((PAGE_COUNT + 1))

    if [ -z "$CURSOR" ]; then
        AFTER_CLAUSE=""
    else
        AFTER_CLAUSE=", after: \"$CURSOR\""
    fi

    ITEMS_QUERY="query(\$org: String!, \$project: Int!) {
      organization(login: \$org) {
        projectV2(number: \$project) {
          title
          items(first: 100$AFTER_CLAUSE) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              content {
                ... on Issue {
                  title
                  url
                  state
                  number
                  assignees(first: 10) {
                    nodes {
                      login
                    }
                  }
                }
              }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field {
                      ... on ProjectV2SingleSelectField {
                        name
                      }
                    }
                    name
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                    date
                  }
                  ... on ProjectV2ItemFieldNumberValue {
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                    number
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    field {
                      ... on ProjectV2Field {
                        name
                      }
                    }
                    text
                  }
                }
              }
            }
          }
        }
      }
    }"

    PAGE_DATA=$(gh api graphql -f query="$ITEMS_QUERY" -f org="$OWNER" -F project="$PROJECT_NUMBER" 2>/dev/null || echo "{}")
    PAGE_ITEMS=$(echo "$PAGE_DATA" | jq '.data.organization.projectV2.items.nodes // []')
    ALL_ITEMS=$(echo "$ALL_ITEMS" "$PAGE_ITEMS" | jq -s 'add')
    HAS_NEXT_PAGE=$(echo "$PAGE_DATA" | jq -r '.data.organization.projectV2.items.pageInfo.hasNextPage // false')
    CURSOR=$(echo "$PAGE_DATA" | jq -r '.data.organization.projectV2.items.pageInfo.endCursor // ""')
done

ITEM_COUNT=$(echo "$ALL_ITEMS" | jq 'length')
echo "  Fetched $ITEM_COUNT items across $PAGE_COUNT page(s)"

# Fetch open PRs from org repositories
echo "  Fetching open pull requests..."

PR_QUERY='query($org: String!) {
  organization(login: $org) {
    repositories(first: 50, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name
        pullRequests(first: 50, states: OPEN) {
          nodes {
            number
            title
            url
            createdAt
            author { login }
          }
        }
      }
    }
  }
}'

PR_DATA=$(gh api graphql -f query="$PR_QUERY" -f org="$OWNER" 2>/dev/null || echo "{}")
ALL_PRS=$(echo "$PR_DATA" | jq '[.data.organization.repositories.nodes[]? | {repo: .name, prs: .pullRequests.nodes[]?} | {number: .prs.number, title: .prs.title, url: .prs.url, createdAt: .prs.createdAt, author: .prs.author.login, repository: .repo}] // []')
PR_COUNT=$(echo "$ALL_PRS" | jq 'length')
echo "  Fetched $PR_COUNT open pull requests"

# Save items to temp file (avoid command line length limits)
TEMP_FILE=$(mktemp)
echo "$ALL_ITEMS" > "$TEMP_FILE"

# Save PRs to temp file
PR_TEMP_FILE=$(mktemp)
echo "$ALL_PRS" > "$PR_TEMP_FILE"

# Process and save as JSON for the dashboard
python3 - "$TEMP_FILE" "$PROJECT_NAME" "$PROJECT_NUMBER" "$REPORT_FILE" "$PR_TEMP_FILE" << 'PYTHON_SCRIPT'
import json
import sys
import re
from datetime import datetime, timezone

with open(sys.argv[1], 'r') as f:
    items = json.load(f)
project_name = sys.argv[2]
project_number = sys.argv[3]
output_file = sys.argv[4]
with open(sys.argv[5], 'r') as f:
    prs = json.load(f)

# Extract repository names from project issues
project_repos = set()
for item in items:
    url = item.get('content', {}).get('url', '')
    # Extract repo name from URL like https://github.com/org/repo/issues/123
    match = re.search(r'github\.com/[^/]+/([^/]+)/', url)
    if match:
        project_repos.add(match.group(1))

def get_status(item):
    for field in item.get('fieldValues', {}).get('nodes', []):
        if field.get('field', {}).get('name') == 'Status':
            return field.get('name', 'Todo')
    return 'Todo'

# Filter open items (not closed, not on hold)
open_items = [item for item in items
              if item.get('content', {}).get('state') != 'CLOSED'
              and get_status(item) != 'On Hold']

# Process epics
epics = []
for item in open_items:
    is_epic = False
    for field in item.get('fieldValues', {}).get('nodes', []):
        if field.get('field', {}).get('name') == 'Is Epic' and field.get('name') == 'Yes':
            is_epic = True
            break

    if is_epic:
        fields = {}
        for field in item.get('fieldValues', {}).get('nodes', []):
            field_name = field.get('field', {}).get('name', '')
            if field_name == 'Status':
                fields['status'] = field.get('name', 'Todo')
            elif field_name == 'Start Date':
                fields['startDate'] = field.get('date', '')
            elif field_name == 'Target Date':
                fields['targetDate'] = field.get('date', '')

        content = item.get('content', {})
        assignees = [a['login'] for a in content.get('assignees', {}).get('nodes', [])]

        epics.append({
            'number': content.get('number', ''),
            'title': content.get('title', ''),
            'url': content.get('url', ''),
            'state': content.get('state', ''),
            'assignees': ', '.join(assignees) if assignees else '',
            'startDate': fields.get('startDate', ''),
            'targetDate': fields.get('targetDate', ''),
            'status': fields.get('status', 'Todo')
        })

# Health check
missing_assignee = []
missing_status = []
missing_start = []
missing_target = []
missing_hours = []

for item in open_items:
    content = item.get('content', {})
    url = content.get('url', '')
    if not url:
        continue

    if not content.get('assignees', {}).get('nodes', []):
        missing_assignee.append(url)

    fields = {field.get('field', {}).get('name', ''): field
              for field in item.get('fieldValues', {}).get('nodes', [])}

    if 'Status' not in fields:
        missing_status.append(url)
    if 'Start Date' not in fields:
        missing_start.append(url)
    if 'Target Date' not in fields:
        missing_target.append(url)
    if 'Work Hours' not in fields:
        missing_hours.append(url)

health_check = [
    {'metric': 'Missing Assignee', 'count': len(missing_assignee), 'description': f'{len(missing_assignee)} issues'},
    {'metric': 'Missing Status', 'count': len(missing_status), 'description': f'{len(missing_status)} issues'},
    {'metric': 'Missing Start Date', 'count': len(missing_start), 'description': f'{len(missing_start)} issues'},
    {'metric': 'Missing Target Date', 'count': len(missing_target), 'description': f'{len(missing_target)} issues'},
    {'metric': 'Missing Work Hours', 'count': len(missing_hours), 'description': f'{len(missing_hours)} issues'}
]

# Resource load
assignee_counts = {}
for item in items:
    if item.get('content', {}).get('state') == 'CLOSED':
        continue
    status = get_status(item)
    if status not in ['Done', 'On Hold']:
        for assignee in item.get('content', {}).get('assignees', {}).get('nodes', []):
            login = assignee['login']
            assignee_counts[login] = assignee_counts.get(login, 0) + 1

resource_load = [{'assignee': f'@{k}', 'count': v}
                 for k, v in sorted(assignee_counts.items(), key=lambda x: -x[1])]

# Assignee tasks (for drill-down)
assignee_tasks = {}
for item in items:
    if item.get('content', {}).get('state') == 'CLOSED':
        continue
    status = get_status(item)
    if status not in ['Done', 'On Hold']:
        content = item.get('content', {})
        for assignee in content.get('assignees', {}).get('nodes', []):
            login = assignee['login']
            if login not in assignee_tasks:
                assignee_tasks[login] = []
            assignee_tasks[login].append({
                'number': content.get('number'),
                'title': content.get('title'),
                'url': content.get('url'),
                'status': status
            })

# Issue details
issue_details = {}
if missing_assignee:
    issue_details['Missing Assignee'] = missing_assignee
if missing_status:
    issue_details['Missing Status'] = missing_status
if missing_start:
    issue_details['Missing Start Date'] = missing_start
if missing_target:
    issue_details['Missing Target Date'] = missing_target
if missing_hours:
    issue_details['Missing Work Hours'] = missing_hours

# Process PRs - filter by project repos and check if late (>24 hours old)
now = datetime.now(timezone.utc)
open_prs = []
for pr in prs:
    # Only include PRs from repositories that have issues in this project
    if pr.get('repository') not in project_repos:
        continue

    if pr.get('createdAt'):
        created = datetime.fromisoformat(pr['createdAt'].replace('Z', '+00:00'))
        age_hours = (now - created).total_seconds() / 3600
        is_late = age_hours > 24
    else:
        age_hours = 0
        is_late = False
    open_prs.append({
        'number': pr.get('number'),
        'title': pr.get('title'),
        'url': pr.get('url'),
        'author': pr.get('author'),
        'repository': pr.get('repository'),
        'createdAt': pr.get('createdAt'),
        'ageHours': round(age_hours, 1),
        'isLate': is_late
    })

# Sort by age (oldest first)
open_prs.sort(key=lambda x: -x.get('ageHours', 0))

# Build final report
report = {
    'projectName': project_name,
    'projectNumber': int(project_number),
    'reportDate': datetime.now().strftime('%Y-%m-%d'),
    'reportTime': datetime.now().strftime('%H:%M'),
    'totalActiveItems': len(open_items),
    'totalOpenEpics': len(epics),
    'totalViolations': sum(h['count'] for h in health_check),
    'healthCheck': health_check,
    'resourceLoad': resource_load,
    'epicRoadmap': epics,
    'issueDetails': issue_details,
    'assigneeTasks': assignee_tasks,
    'openPRs': open_prs,
    'totalOpenPRs': len(open_prs),
    'totalLatePRs': sum(1 for pr in open_prs if pr.get('isLate'))
}

with open(output_file, 'w') as f:
    json.dump(report, f, indent=2)

print(f"  Report saved: {output_file}")
PYTHON_SCRIPT

# Clean up temp files
rm -f "$TEMP_FILE"
rm -f "$PR_TEMP_FILE"

echo "  Done!"
