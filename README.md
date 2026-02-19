# Organization SitRep Dashboard

A real-time PMO dashboard for monitoring all GitHub Projects across an organization. Provides project health metrics, resource allocation, risk scoring, overdue tracking, epic progress, and issue violations from a single pane of glass.

## Features

### Organization Overview
- **Cross-Project Summary Table**: Sortable table comparing all projects side-by-side (active items, epics, violations, PRs, unassigned, overdue, risk score). Click column headers to sort, click rows to drill into a project.
- **Project Search**: Case-insensitive, real-time search bar that filters projects as you type (partial word matching).

### Project Detail View
- **Issue Health Check**: Horizontal bar chart and table tracking missing assignees, statuses, start/target dates, and work hours.
- **Resource Load**: Bubble chart and table showing team member workload distribution (Low/Medium/High). Click to drill down into individual assignee tasks.
- **Idle Members**: Identifies team members with zero active tasks across a project.
- **Status Distribution**: Stacked bar chart with legend showing item counts by status (Todo, In Progress, Done, On Hold, etc.).
- **Overdue Items**: Table of items past their target date, sorted by severity. Color-coded: >14 days (critical), >7 days (warning), <=7 days (minor).
- **Aging Work in Progress**: Tracks how long items have been "In Progress" based on their start date. Flags items >7 days (Monitor) and >14 days (At Risk).
- **Project Risk Score**: Weighted composite score (0-100) with levels (Low/Medium/High/Critical). Factors: violations (25%), overdue items (30%), unassigned (15%), idle members (10%), late PRs (10%), severely aging WIP (10%).
- **Epic Roadmap**: Table of open epics with assignees, start/target dates, and status.
- **Flagged Issues**: Issues grouped by violation type with direct links to GitHub.
- **Pull Request Tracking**: Open PRs per project with age indicators and late alerts (>24 hours).

### General
- **Passcode Authentication**: Dashboard is gated behind a configurable passcode with session-based auth.
- **Auto-Refresh**: Reports auto-regenerate every 5 minutes.
- **Auto-Load on Start**: Reports are fetched automatically when the server starts.
- **Manual Regeneration**: Button to trigger report regeneration on demand with progress indicator.

## Requirements

- Python 3.6+
- GitHub CLI (`gh`) - authenticated with your account
- `jq` for JSON processing

## Quick Start

1. **Configure the dashboard**:
   ```bash
   cp config.sample.json config.json
   # Edit config.json with your GitHub token and org name
   ```

2. **Start the dashboard**:
   ```bash
   ./start.sh
   ```
   Reports are automatically loaded on server start.

3. **Open in browser**: http://localhost:8080

## Configuration

### Local (config.json)

```json
{
  "github": {
    "owner": "your-org-name",
    "token": "ghp_YOUR_GITHUB_TOKEN"
  },
  "dashboard": {
    "refresh_interval_minutes": 5,
    "port": 8080
  }
}
```

### Environment Variables

Environment variables take precedence over `config.json`:

| Variable | Description | Required |
|----------|-------------|----------|
| `GH_TOKEN` | GitHub personal access token | Yes |
| `GITHUB_OWNER` | GitHub organization login name | Yes |
| `DASHBOARD_PASSCODE` | Passcode to access the dashboard | No (has default) |
| `PORT` | HTTP server port | No (default: 8080) |

### GitHub Token Permissions

Your token needs these scopes:
- `read:project` - Read project data
- `repo` - Access repository issues and pull requests

## Deployment

### Render.com

The project includes a `render.yaml` blueprint for one-click deployment:

1. Push to a GitHub repository
2. Connect the repo to Render
3. Set the environment variables (`GH_TOKEN`, `GITHUB_OWNER`, `DASHBOARD_PASSCODE`)
4. Deploy

The build script (`build.sh`) installs standalone `jq` and `gh` CLI binaries automatically.

### Manual

```bash
# Ensure gh CLI is authenticated
gh auth login

# Start the server
python3 dashboard/server.py
```

## Project Structure

```
org-sitrep-dashboard/
├── config.json              # Configuration (not in git)
├── config.sample.json       # Config template
├── start.sh                 # Server startup script
├── build.sh                 # Render deployment build script
├── render.yaml              # Render.com deployment blueprint
├── scripts/
│   ├── fetch_all_projects.sh       # Orchestrates report generation for all projects
│   └── generate_project_report.sh  # Generates single project report with all metrics
├── dashboard/
│   ├── index.html           # Dashboard UI
│   ├── styles.css           # Dark theme styling
│   ├── app.js               # Frontend logic & visualizations
│   └── server.py            # Python HTTP server & API endpoints
└── reports/                 # Generated JSON reports (not in git)
```

## API Endpoints

All data endpoints require authentication via session cookie.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | No | Serve dashboard |
| `/health` | GET | No | Health check |
| `/api/auth` | POST | No | Authenticate with passcode, returns session cookie |
| `/api/data` | GET | Yes | Get all projects data (latest reports) |
| `/api/projects` | GET | Yes | Get projects list |
| `/api/regenerate` | POST | Yes | Trigger regeneration of all reports |

## Report Data

Each project report includes:

- **Health Metrics**: Missing assignee, status, start date, target date, work hours
- **Resource Load**: Active items per assignee with load classification
- **Idle Members**: Project members with zero active tasks
- **Overdue Items**: Items past target date with days overdue
- **Status Distribution**: Item counts by status across all items
- **Aging WIP**: In-progress items with days since start date
- **Risk Score**: Composite score (0-100) with risk level classification
- **Epic Roadmap**: Open epics with dates and assignees
- **Open PRs**: Pull requests with age and late status
- **Flagged Issues**: Issues grouped by violation type
