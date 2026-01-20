# Organization SitRep Dashboard

A real-time dashboard for monitoring all GitHub Projects across an organization. Displays project health metrics, resource allocation, epic progress, and issue violations.

## Features

- **Organization Overview**: View all projects at a glance with key metrics (active items, epics, violations, team members, open PRs)
- **Project Details**: Drill down into individual project data
- **Health Check**: Track missing assignees, statuses, dates, and work hours
- **Resource Load**: Monitor team member workload distribution with clickable drill-down to view individual tasks
- **Epic Roadmap**: View open epics and their progress
- **Pull Request Tracking**: Monitor open PRs per project with age indicators and late PR alerts (>24 hours)
- **Auto-Refresh**: Dashboard updates every 5 minutes automatically
- **Auto-Load on Start**: Reports are automatically loaded when the server starts

## Requirements

- Python 3.6+
- GitHub CLI (`gh`) - authenticated with your account
- `jq` for JSON processing

## Quick Start

1. **Configure the dashboard**:
   ```bash
   cp config.sample.json config.json
   # Edit config.json with your GitHub token
   ```

2. **Start the dashboard**:
   ```bash
   ./start.sh
   ```
   Reports are automatically loaded on server start.

3. **Open in browser**: http://localhost:8080

## Configuration

Edit `config.json`:

```json
{
  "github": {
    "owner": "aibos-dev",
    "token": "ghp_YOUR_GITHUB_TOKEN"
  },
  "dashboard": {
    "refresh_interval_minutes": 5,
    "port": 8080
  }
}
```

### GitHub Token Permissions

Your token needs these scopes:
- `read:project` - Read project data
- `repo` - Access repository issues

## Project Structure

```
org-sitrep-dashboard/
├── config.json          # Configuration (not in git)
├── config.sample.json   # Config template
├── start.sh             # Main startup script
├── scripts/
│   ├── fetch_all_projects.sh    # Fetch all org projects
│   └── generate_project_report.sh  # Generate single project report
├── dashboard/
│   ├── index.html       # Dashboard UI
│   ├── styles.css       # Styling
│   ├── app.js           # Frontend logic
│   └── server.py        # HTTP server & API
└── reports/             # Generated reports (not in git)
```

## API Endpoints

- `GET /api/data` - Get all projects data
- `GET /api/projects` - Get projects list
- `POST /api/regenerate` - Regenerate all reports


