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
- **Risk Score**: Composite score (0-100) with risk level classification (see below)
- **Epic Roadmap**: Open epics with dates and assignees
- **Open PRs**: Pull requests with age and late status
- **Flagged Issues**: Issues grouped by violation type

## Risk Score Calculation

Each project receives a composite risk score from 0 to 100, computed as a weighted sum of six factors. Each factor is a ratio (0.0 to 1.0) multiplied by its weight. The divisor for each ratio ensures the score scales relative to the project's size.

### Factors and Weights

| Factor | Weight | Formula | What it measures |
|--------|--------|---------|------------------|
| Violations | 25 | `total health violations / active items` | Data quality gaps (missing assignee, status, dates, hours) |
| Overdue items | 30 | `items past target date / active items` | Delivery slippage |
| Unassigned items | 15 | `unassigned item count / active items` | Unowned work |
| Idle members | 10 | `idle members / total project members` | Underutilized team capacity |
| Late PRs | 10 | `PRs older than 24h / total open PRs` | Code review bottlenecks |
| Severely aging WIP | 10 | `in-progress items > 14 days / active items` | Stalled work items |

All ratios are capped at 1.0. The maximum possible score is 100 (all factors at worst case).

### Risk Levels

| Score Range | Level | Badge Color |
|-------------|-------|-------------|
| 0 - 15 | Low | Green |
| 16 - 40 | Medium | Yellow |
| 41 - 70 | High | Red |
| 71 - 100 | Critical | Dark Red |

### Example

A project with 10 active items, 3 project members (1 idle), 2 open PRs (0 late):

| Factor | Values | Ratio | Weighted |
|--------|--------|-------|----------|
| Violations | 5 violations | 5/10 = 0.50 | 0.50 x 25 = 12.5 |
| Overdue | 3 overdue | 3/10 = 0.30 | 0.30 x 30 = 9.0 |
| Unassigned | 2 unassigned | 2/10 = 0.20 | 0.20 x 15 = 3.0 |
| Idle members | 1 idle / 3 total | 1/3 = 0.33 | 0.33 x 10 = 3.3 |
| Late PRs | 0 late / 2 open | 0/2 = 0.00 | 0.00 x 10 = 0.0 |
| Aging WIP | 1 item > 14 days | 1/10 = 0.10 | 0.10 x 10 = 1.0 |
| | | **Total** | **28.8 → 29** |

Result: **29 → Medium risk** (yellow badge)
