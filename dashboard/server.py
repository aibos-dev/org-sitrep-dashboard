#!/usr/bin/env python3
"""
Organization SitRep Dashboard Server
Serves the dashboard and provides API endpoints for project data.
"""

import http.server
import json
import os
import subprocess
from datetime import datetime
from glob import glob
from pathlib import Path
from urllib.parse import urlparse

# Configuration
PORT = 8080
DASHBOARD_DIR = Path(__file__).parent
PROJECT_DIR = DASHBOARD_DIR.parent
REPORTS_DIR = PROJECT_DIR / "reports"
SCRIPTS_DIR = PROJECT_DIR / "scripts"
CONFIG_FILE = PROJECT_DIR / "config.json"


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP handler for the dashboard."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DASHBOARD_DIR), **kwargs)

    def do_GET(self):
        """Handle GET requests."""
        parsed_path = urlparse(self.path)

        if parsed_path.path == "/api/data":
            self.send_json_response(get_all_projects_data())
        elif parsed_path.path == "/api/projects":
            self.send_json_response(get_projects_list())
        elif parsed_path.path == "/":
            self.path = "/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def do_POST(self):
        """Handle POST requests."""
        parsed_path = urlparse(self.path)

        if parsed_path.path == "/api/regenerate":
            result = regenerate_all_reports()
            self.send_json_response(result)
        else:
            self.send_error(404, "Not Found")

    def send_json_response(self, data):
        """Send a JSON response."""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def get_projects_list():
    """Get list of projects from projects.json."""
    projects_file = REPORTS_DIR / "projects.json"
    if projects_file.exists():
        with open(projects_file, "r") as f:
            return json.load(f)
    return []


def get_latest_report_for_project(project_number):
    """Find the most recent report for a specific project."""
    pattern = str(REPORTS_DIR / f"sitrep_*_{project_number}_*.json")

    # Try finding by project number in filename
    reports = glob(pattern)

    if not reports:
        # Try alternative patterns - search all JSON reports
        all_reports = glob(str(REPORTS_DIR / "sitrep_*.json"))
        for report in all_reports:
            try:
                with open(report, "r") as f:
                    data = json.load(f)
                    if data.get("projectNumber") == project_number:
                        reports.append(report)
            except (json.JSONDecodeError, KeyError):
                continue

    if not reports:
        return None

    return max(reports, key=os.path.getmtime)


def get_all_projects_data():
    """Get data for all projects from the latest reports."""
    projects_data = []

    # Get all JSON report files
    report_files = glob(str(REPORTS_DIR / "sitrep_*.json"))

    # Group by project number and get latest for each
    project_reports = {}
    for report_file in report_files:
        try:
            with open(report_file, "r") as f:
                data = json.load(f)
                proj_num = data.get("projectNumber")
                if proj_num:
                    # Keep the latest report for each project
                    mtime = os.path.getmtime(report_file)
                    if proj_num not in project_reports or mtime > project_reports[proj_num][1]:
                        project_reports[proj_num] = (data, mtime)
        except (json.JSONDecodeError, KeyError):
            continue

    # Extract just the data
    for proj_num, (data, mtime) in project_reports.items():
        projects_data.append(data)

    # Sort by project number
    projects_data.sort(key=lambda x: x.get("projectNumber", 0))

    return {
        "projects": projects_data,
        "lastUpdate": datetime.now().isoformat(),
        "projectCount": len(projects_data),
    }


def regenerate_all_reports():
    """Run the report generation script for all projects."""
    try:
        script_path = SCRIPTS_DIR / "fetch_all_projects.sh"
        if not script_path.exists():
            return {"success": False, "error": "Fetch script not found"}

        result = subprocess.run(
            ["bash", str(script_path)],
            cwd=str(PROJECT_DIR),
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout for all projects
        )

        if result.returncode == 0:
            return {"success": True, "message": "All reports regenerated successfully"}
        else:
            return {
                "success": False,
                "error": result.stderr or "Unknown error during report generation",
            }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Report generation timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def load_config():
    """Load configuration from config.json."""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return {}


def run_server():
    """Start the dashboard server."""
    config = load_config()
    port = config.get("dashboard", {}).get("port", PORT)
    org = config.get("github", {}).get("owner", "Unknown")

    print(f"\n{'='*55}")
    print("  Organization SitRep Dashboard Server")
    print(f"{'='*55}")
    print(f"  Organization: {org}")
    print(f"  Dashboard:    http://localhost:{port}")
    print(f"  API Data:     http://localhost:{port}/api/data")
    print(f"  Reports:      {REPORTS_DIR}")
    print(f"{'='*55}")

    # Fetch initial data on server start
    print("\n  Loading initial reports...")
    result = regenerate_all_reports()
    if result.get("success"):
        print("  Initial reports loaded successfully.")
    else:
        print(f"  Warning: Failed to load initial reports: {result.get('error', 'Unknown error')}")

    print("\n  Press Ctrl+C to stop the server\n")

    with http.server.HTTPServer(("", port), DashboardHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")


if __name__ == "__main__":
    run_server()
