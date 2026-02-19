// Dashboard Configuration
const CONFIG = {
    refreshInterval: 5 * 60 * 1000, // 5 minutes in milliseconds
    apiEndpoint: '/api/data',
    projectsEndpoint: '/api/projects',
    regenerateEndpoint: '/api/regenerate'
};

let refreshTimer = null;
let nextRefreshTime = null;
let allProjectsData = [];
let currentProject = 'all';
let currentProjectData = null;
let isRegenerating = false;

// Authenticated fetch wrapper — redirects to login on 401
async function authFetch(url, options = {}) {
    const response = await fetch(url, options);
    if (response.status === 401) {
        showToast('Session expired. Redirecting to login...', 'error');
        if (refreshTimer) clearInterval(refreshTimer);
        setTimeout(() => {
            document.getElementById('dashboard-container').classList.add('hidden');
            document.getElementById('auth-screen').classList.remove('hidden');
            document.getElementById('passcode-input').value = '';
            document.getElementById('passcode-input').focus();
        }, 1000);
        throw new Error('Session expired');
    }
    return response;
}

// Initialize dashboard (called after successful authentication)
function initDashboard() {
    setupEventListeners();
    refreshData();
    startAutoRefresh();
    updateRefreshCountdown();
}

// Check if already authenticated (cookie still valid) on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('dashboard-container').classList.remove('hidden');
            initDashboard();
        }
    } catch (e) {
        // Not authenticated, show login screen
    }
});

function setupEventListeners() {
    document.getElementById('project-select').addEventListener('change', (e) => {
        currentProject = e.target.value;
        updateView();
    });

    document.getElementById('project-search').addEventListener('input', (e) => {
        filterProjects(e.target.value);
    });
}

function filterProjects(query) {
    const q = query.toLowerCase().trim();
    const rows = document.querySelectorAll('.cross-project-row');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
}

// Auto-refresh functionality (triggers full regeneration)
function startAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    nextRefreshTime = Date.now() + CONFIG.refreshInterval;
    refreshTimer = setInterval(() => {
        // Skip if regeneration is already in progress
        if (!isRegenerating) {
            regenerateReports(true);  // true = auto-triggered
        }
    }, CONFIG.refreshInterval);
}

function resetAutoRefreshTimer() {
    nextRefreshTime = Date.now() + CONFIG.refreshInterval;
}

function updateRefreshCountdown() {
    setInterval(() => {
        if (nextRefreshTime) {
            const remaining = Math.max(0, nextRefreshTime - Date.now());
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            document.getElementById('next-refresh').textContent =
                `Next regeneration: ${minutes}m ${seconds}s`;
        }
    }, 1000);
}

// Fetch and refresh data
async function refreshData() {
    showToast('Refreshing data...', 'info');
    try {
        const response = await authFetch(CONFIG.apiEndpoint);
        const data = await response.json();
        allProjectsData = data.projects || [];

        // Update project selector
        updateProjectSelector(allProjectsData);

        // Update last update time
        document.getElementById('last-update').innerHTML =
            `<span class="live-indicator"></span>Last update: ${new Date().toLocaleTimeString()}`;

        // Update the view
        updateView();

        showToast('Data refreshed successfully', 'success');
    } catch (error) {
        console.error('Error fetching data:', error);
        showToast('Failed to refresh data: ' + error.message, 'error');
    }
}

// Update project selector dropdown
function updateProjectSelector(projects) {
    const select = document.getElementById('project-select');
    const currentValue = select.value;

    // Keep the "All Projects" option
    select.innerHTML = '<option value="all">All Projects (Overview)</option>';

    // Add project options
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.projectNumber;
        option.textContent = `#${project.projectNumber} - ${project.projectName}`;
        select.appendChild(option);
    });

    // Restore selection
    if (currentValue && [...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
    }
}

// Update the view based on selected project
function updateView() {
    const orgOverview = document.getElementById('org-overview');
    const projectView = document.getElementById('project-view');

    if (currentProject === 'all') {
        orgOverview.classList.remove('hidden');
        projectView.classList.add('hidden');
        updateOrgOverview(allProjectsData);
    } else {
        orgOverview.classList.add('hidden');
        projectView.classList.remove('hidden');
        const projectData = allProjectsData.find(p => p.projectNumber == currentProject);
        if (projectData) {
            updateProjectDashboard(projectData);
        }
    }
}

// Update organization overview
function updateOrgOverview(projects) {
    updateCrossProjectTable(projects);
}

// Update single project dashboard
function updateProjectDashboard(data) {
    // Store current project data for modal access
    currentProjectData = data;

    // Update summary cards
    document.getElementById('total-items').textContent = data.totalActiveItems || 0;
    document.getElementById('open-epics').textContent = data.totalOpenEpics || 0;
    document.getElementById('total-violations').textContent = data.totalViolations || 0;
    document.getElementById('team-members').textContent =
        data.resourceLoad ? data.resourceLoad.length : 0;
    document.getElementById('open-prs').textContent = data.totalOpenPRs || 0;
    document.getElementById('project-overdue').textContent = data.totalOverdueItems || 0;

    // Update risk level card
    const riskLevel = data.riskLevel || 'Low';
    const riskEl = document.getElementById('project-risk-level');
    riskEl.textContent = riskLevel;
    riskEl.className = `card-value risk-text-${riskLevel.toLowerCase()}`;
    const riskIcon = document.getElementById('risk-card');
    riskIcon.className = `card-icon risk-card-icon risk-icon-${riskLevel.toLowerCase()}`;

    // Update health check
    updateHealthCheck(data.healthCheck || []);

    // Update resource load
    updateResourceLoad(data.resourceLoad || [], data.unassignedItems || 0);

    // Update idle members
    updateIdleMembers(data.idleMembers || []);

    // Update status distribution
    updateStatusDistribution(data.statusDistribution || []);

    // Update overdue items
    updateOverdueItems(data.overdueItems || []);

    // Update aging WIP
    updateAgingWIP(data.agingWIP || []);

    // Update epic roadmap
    updateEpicRoadmap(data.epicRoadmap || []);

    // Update flagged issues
    updateFlaggedIssues(data.issueDetails || {});

    // Update pull requests
    updatePullRequests(data.openPRs || []);
}

// Health Check visualization
function updateHealthCheck(healthData) {
    const barsContainer = document.getElementById('health-bars');
    const tableBody = document.querySelector('#health-table tbody');

    const maxValue = Math.max(...healthData.map(h => h.count), 1);

    barsContainer.innerHTML = '';
    tableBody.innerHTML = '';

    healthData.forEach(item => {
        const percentage = (item.count / maxValue) * 100;
        const barHtml = `
            <div class="health-bar-item">
                <span class="health-bar-label">${item.metric}</span>
                <div class="health-bar-container">
                    <div class="health-bar" style="width: ${Math.max(percentage, item.count > 0 ? 5 : 0)}%">
                        ${item.count > 0 ? `<span class="health-bar-value">${item.count}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        barsContainer.innerHTML += barHtml;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.metric}</td>
            <td><strong>${item.count}</strong></td>
            <td>${item.description || `${item.count} issues`}</td>
        `;
        tableBody.appendChild(row);
    });

    if (healthData.length === 0) {
        barsContainer.innerHTML = '<p class="no-data">No health data available</p>';
        tableBody.innerHTML = '<tr><td colspan="3" class="no-data">No health data available</td></tr>';
    }
}

// Resource Load visualization
function updateResourceLoad(resourceData, unassignedCount = 0) {
    const chartContainer = document.getElementById('resource-chart');
    const tableBody = document.querySelector('#resource-table tbody');

    resourceData.sort((a, b) => b.count - a.count);

    const allData = [...resourceData];
    if (unassignedCount > 0) {
        allData.push({ assignee: 'Unassigned Tasks', count: unassignedCount });
    }

    const maxCount = Math.max(...allData.map(r => r.count), 1);

    const colors = [
        '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7',
        '#06b6d4', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6'
    ];

    chartContainer.innerHTML = '';
    tableBody.innerHTML = '';

    allData.forEach((item, index) => {
        const isUnassigned = item.assignee === 'Unassigned Tasks';
        const size = 30 + (item.count / maxCount) * 40;
        const color = isUnassigned ? '#94a3b8' : colors[index % colors.length];
        const bubble = document.createElement('div');
        bubble.className = 'resource-bubble' + (isUnassigned ? ' unassigned-bubble' : '');
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        bubble.style.background = color;
        bubble.textContent = item.count;
        bubble.title = `${item.assignee}: ${item.count} issues` + (isUnassigned ? '' : ' - Click to view tasks');
        if (!isUnassigned) {
            bubble.onclick = () => showAssigneeTasks(item.assignee);
        } else {
            bubble.onclick = () => showAssigneeTasks('_unassigned');
        }
        chartContainer.appendChild(bubble);

        const loadClass = isUnassigned ? 'load-unassigned' :
                         item.count <= 3 ? 'load-low' :
                         item.count <= 6 ? 'load-medium' : 'load-high';
        const loadText = isUnassigned ? 'Unassigned' :
                        item.count <= 3 ? 'Low' :
                        item.count <= 6 ? 'Medium' : 'High';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.assignee}</td>
            <td><strong>${item.count}</strong></td>
            <td><span class="load-indicator ${loadClass}">${loadText}</span></td>
        `;
        row.style.cursor = 'pointer';
        row.title = isUnassigned ? 'Click to view unassigned tasks' : 'Click to view tasks';
        row.onclick = () => showAssigneeTasks(isUnassigned ? '_unassigned' : item.assignee);
        tableBody.appendChild(row);
    });

    if (allData.length === 0) {
        chartContainer.innerHTML = '<p class="no-data">No resource data available</p>';
        tableBody.innerHTML = '<tr><td colspan="3" class="no-data">No resource data available</td></tr>';
    }
}

// Idle Members list
function updateIdleMembers(idleMembers) {
    const section = document.getElementById('idle-members-section');
    const list = document.getElementById('idle-members-list');

    if (!idleMembers || idleMembers.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.innerHTML = idleMembers.map(member =>
        `<span class="idle-member-tag">@${member}</span>`
    ).join('');
}

// Epic Roadmap
function updateEpicRoadmap(epicData) {
    const container = document.getElementById('epic-content');

    if (!epicData || epicData.length === 0) {
        container.innerHTML = '<p class="no-data">No open epics found</p>';
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Issue</th>
                    <th>Title</th>
                    <th>State</th>
                    <th>Assignees</th>
                    <th>Start Date</th>
                    <th>Target Date</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    epicData.forEach(epic => {
        html += `
            <tr>
                <td><a href="${epic.url}" target="_blank">#${epic.number}</a></td>
                <td>${epic.title}</td>
                <td>${epic.state}</td>
                <td>${epic.assignees || '-'}</td>
                <td>${epic.startDate || '-'}</td>
                <td>${epic.targetDate || '-'}</td>
                <td>${epic.status || '-'}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// Flagged Issues
function updateFlaggedIssues(issueDetails) {
    const container = document.getElementById('issues-content');

    const categories = Object.keys(issueDetails);
    if (categories.length === 0) {
        container.innerHTML = '<p class="no-data">No flagged issues</p>';
        return;
    }

    let html = '';
    categories.forEach(category => {
        const issues = issueDetails[category] || [];
        if (issues.length === 0) return;

        html += `
            <div class="issue-category">
                <h3>${category} <span class="issue-count">${issues.length}</span></h3>
                <div class="issue-list">
        `;

        issues.forEach(issue => {
            const issueNum = issue.match(/#(\d+)/) || issue.match(/issues\/(\d+)/);
            const displayText = issueNum ? `#${issueNum[1]}` : issue;
            html += `<a href="${issue}" target="_blank" class="issue-link">${displayText}</a>`;
        });

        html += '</div></div>';
    });

    container.innerHTML = html || '<p class="no-data">No flagged issues</p>';
}

// Status Distribution visualization
function updateStatusDistribution(statusData) {
    const chartContainer = document.getElementById('status-chart');
    const legendContainer = document.getElementById('status-legend');

    if (!statusData || statusData.length === 0) {
        chartContainer.innerHTML = '<p class="no-data">No status data available</p>';
        legendContainer.innerHTML = '';
        return;
    }

    const total = statusData.reduce((sum, s) => sum + s.count, 0);
    const statusColors = {
        'Done': '#22c55e',
        'In Progress': '#3b82f6',
        'Todo': '#94a3b8',
        'On Hold': '#eab308',
        'In Review': '#a855f7',
        'Blocked': '#ef4444'
    };
    const defaultColors = ['#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6'];
    let colorIdx = 0;

    // Build stacked horizontal bar
    let barHtml = '<div class="status-bar">';
    statusData.forEach(item => {
        const pct = (item.count / total) * 100;
        const color = statusColors[item.status] || defaultColors[colorIdx++ % defaultColors.length];
        barHtml += `<div class="status-bar-segment" style="width:${Math.max(pct, 1)}%;background:${color}" title="${item.status}: ${item.count} (${Math.round(pct)}%)"></div>`;
    });
    barHtml += '</div>';
    chartContainer.innerHTML = barHtml;

    // Build legend with counts
    colorIdx = 0;
    let legendHtml = '';
    statusData.forEach(item => {
        const pct = Math.round((item.count / total) * 100);
        const color = statusColors[item.status] || defaultColors[colorIdx++ % defaultColors.length];
        legendHtml += `
            <div class="status-legend-item">
                <span class="status-legend-color" style="background:${color}"></span>
                <span class="status-legend-label">${item.status}</span>
                <span class="status-legend-count">${item.count}</span>
                <span class="status-legend-pct">${pct}%</span>
            </div>
        `;
    });
    legendContainer.innerHTML = legendHtml;
}

// Overdue Items panel
function updateOverdueItems(overdueData) {
    const container = document.getElementById('overdue-content');

    if (!overdueData || overdueData.length === 0) {
        container.innerHTML = '<p class="no-data">No overdue items</p>';
        return;
    }

    let html = `
        <table class="data-table overdue-table">
            <thead>
                <tr>
                    <th>Issue</th>
                    <th>Title</th>
                    <th>Assignees</th>
                    <th>Target Date</th>
                    <th>Overdue</th>
                </tr>
            </thead>
            <tbody>
    `;

    overdueData.forEach(item => {
        const severityClass = item.daysOverdue > 14 ? 'overdue-critical' :
                             item.daysOverdue > 7 ? 'overdue-warning' : 'overdue-minor';
        html += `
            <tr class="${severityClass}">
                <td><a href="${item.url}" target="_blank">#${item.number}</a></td>
                <td class="overdue-title">${item.title}</td>
                <td>${item.assignees}</td>
                <td>${item.targetDate}</td>
                <td><span class="overdue-badge ${severityClass}">${item.daysOverdue}d</span></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// Aging WIP panel
function updateAgingWIP(agingData) {
    const container = document.getElementById('aging-content');

    if (!agingData || agingData.length === 0) {
        container.innerHTML = '<p class="no-data">No items currently in progress</p>';
        return;
    }

    let html = `
        <table class="data-table aging-table">
            <thead>
                <tr>
                    <th>Issue</th>
                    <th>Title</th>
                    <th>Assignees</th>
                    <th>Start Date</th>
                    <th>Age</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    agingData.forEach(item => {
        let ageDisplay, agingClass;
        if (item.daysInProgress === null) {
            ageDisplay = 'Unknown';
            agingClass = 'aging-unknown';
        } else if (item.daysInProgress > 14) {
            ageDisplay = `${item.daysInProgress}d`;
            agingClass = 'aging-critical';
        } else if (item.daysInProgress > 7) {
            ageDisplay = `${item.daysInProgress}d`;
            agingClass = 'aging-warning';
        } else {
            ageDisplay = `${item.daysInProgress}d`;
            agingClass = 'aging-ok';
        }

        html += `
            <tr>
                <td><a href="${item.url}" target="_blank">#${item.number}</a></td>
                <td class="aging-title">${item.title}</td>
                <td>${item.assignees}</td>
                <td>${item.startDate || '-'}</td>
                <td><span class="aging-badge ${agingClass}">${ageDisplay}</span></td>
                <td><span class="aging-status-badge">${agingClass === 'aging-critical' ? 'At Risk' : agingClass === 'aging-warning' ? 'Monitor' : agingClass === 'aging-unknown' ? 'No Date' : 'Normal'}</span></td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// Cross-Project Summary Table (sortable)
let crossProjectSortCol = 'projectName';
let crossProjectSortAsc = true;

function updateCrossProjectTable(projects) {
    const container = document.getElementById('cross-project-content');

    if (!projects || projects.length === 0) {
        container.innerHTML = '<p class="no-data">No projects found</p>';
        return;
    }

    const sorted = [...projects].sort((a, b) => {
        let valA = a[crossProjectSortCol] ?? 0;
        let valB = b[crossProjectSortCol] ?? 0;
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return crossProjectSortAsc ? -1 : 1;
        if (valA > valB) return crossProjectSortAsc ? 1 : -1;
        return 0;
    });

    const columns = [
        { key: 'projectName', label: 'Project' },
        { key: 'totalActiveItems', label: 'Active' },
        { key: 'totalOpenEpics', label: 'Epics' },
        { key: 'totalViolations', label: 'Violations' },
        { key: 'totalOpenPRs', label: 'PRs' },
        { key: 'unassignedItems', label: 'Unassigned' },
        { key: 'totalOverdueItems', label: 'Overdue' },
        { key: 'riskScore', label: 'Risk' }
    ];

    let html = '<table class="data-table cross-project-table"><thead><tr>';
    columns.forEach(col => {
        const arrow = crossProjectSortCol === col.key ? (crossProjectSortAsc ? ' \u25B2' : ' \u25BC') : '';
        html += `<th class="sortable-th" data-sort="${col.key}">${col.label}${arrow}</th>`;
    });
    html += '</tr></thead><tbody>';

    sorted.forEach(project => {
        const riskLevel = project.riskLevel || 'Low';
        const riskBadge = `<span class="risk-badge risk-${riskLevel.toLowerCase()}">${riskLevel} (${project.riskScore || 0})</span>`;
        const violationClass = (project.totalViolations || 0) > 0 ? ' class="text-warning"' : '';
        const overdueClass = (project.totalOverdueItems || 0) > 0 ? ' class="text-danger"' : '';

        html += `
            <tr class="cross-project-row" data-project="${project.projectNumber}">
                <td><strong>${project.projectName}</strong> <span class="text-muted">#${project.projectNumber}</span></td>
                <td>${project.totalActiveItems || 0}</td>
                <td>${project.totalOpenEpics || 0}</td>
                <td${violationClass}>${project.totalViolations || 0}</td>
                <td>${project.totalOpenPRs || 0}</td>
                <td>${project.unassignedItems || 0}</td>
                <td${overdueClass}>${project.totalOverdueItems || 0}</td>
                <td>${riskBadge}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Add sort click handlers
    container.querySelectorAll('.sortable-th').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (crossProjectSortCol === col) {
                crossProjectSortAsc = !crossProjectSortAsc;
            } else {
                crossProjectSortCol = col;
                crossProjectSortAsc = col === 'projectName';
            }
            updateCrossProjectTable(allProjectsData);
        });
    });

    // Add row click handlers to navigate to project
    container.querySelectorAll('.cross-project-row').forEach(row => {
        row.addEventListener('click', () => {
            const projNum = row.dataset.project;
            document.getElementById('project-select').value = projNum;
            currentProject = projNum;
            updateView();
        });
    });
}

// Regenerate all reports with progress indicator
async function regenerateReports(autoTriggered = false) {
    // Prevent multiple simultaneous regenerations
    if (isRegenerating) {
        return;
    }
    isRegenerating = true;

    const btn = document.getElementById('regenerate-btn');
    const progressContainer = document.getElementById('regenerate-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    btn.disabled = true;
    btn.style.display = 'none';
    progressContainer.classList.remove('hidden');

    // Show initial progress immediately
    progressFill.style.width = '5%';
    progressText.textContent = autoTriggered ? 'Auto-regenerating...' : 'Starting...';
    progressFill.classList.add('animated');

    if (autoTriggered) {
        showToast('Auto-regeneration started...', 'info');
    }

    // Simulate progress stages
    const stages = [
        { progress: 15, text: 'Deleting old reports...' },
        { progress: 30, text: 'Fetching projects...' },
        { progress: 50, text: 'Fetching open items...' },
        { progress: 70, text: 'Generating reports...' },
        { progress: 90, text: 'Finalizing...' }
    ];

    let stageIndex = 0;
    const progressInterval = setInterval(() => {
        if (stageIndex < stages.length) {
            progressFill.style.width = stages[stageIndex].progress + '%';
            progressText.textContent = stages[stageIndex].text;
            stageIndex++;
        }
    }, 600);

    try {
        const response = await authFetch(CONFIG.regenerateEndpoint, { method: 'POST' });
        const result = await response.json();

        clearInterval(progressInterval);

        if (result.success) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Complete!';
            showToast('Reports regenerated! Refreshing...', 'success');

            setTimeout(() => {
                resetProgressUI(btn, progressContainer, progressFill, progressText);
                isRegenerating = false;
                resetAutoRefreshTimer();
                refreshData();
            }, 1000);
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        clearInterval(progressInterval);
        console.error('Error regenerating reports:', error);

        // Show error state in progress bar
        progressFill.classList.remove('animated');
        progressFill.style.background = 'var(--accent-red)';
        progressText.textContent = 'Failed!';
        showToast('Failed to regenerate: ' + error.message, 'error');

        // Keep error visible for a moment before resetting
        setTimeout(() => {
            progressFill.style.background = '';
            resetProgressUI(btn, progressContainer, progressFill, progressText);
            isRegenerating = false;
            resetAutoRefreshTimer();
        }, 2000);
    }
}

function resetProgressUI(btn, progressContainer, progressFill, progressText) {
    btn.disabled = false;
    btn.style.display = '';
    progressContainer.classList.add('hidden');
    progressFill.classList.remove('animated');
    progressFill.style.width = '0%';
    progressText.textContent = 'Generating...';
}

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Assignee Tasks Modal
function showAssigneeTasks(assignee) {
    if (!currentProjectData || !currentProjectData.assigneeTasks) {
        showToast('No task data available', 'error');
        return;
    }

    // Handle unassigned items or regular assignees
    const isUnassigned = assignee === '_unassigned' || assignee === 'Unassigned Tasks';
    const login = isUnassigned ? '_unassigned' : (assignee.startsWith('@') ? assignee.slice(1) : assignee);
    const tasks = currentProjectData.assigneeTasks[login] || [];

    const modal = document.getElementById('assignee-modal');
    const nameElement = document.getElementById('modal-assignee-name');
    const tasksList = document.getElementById('modal-tasks-list');

    nameElement.textContent = isUnassigned ? 'Unassigned Items' : `@${login}`;

    if (tasks.length === 0) {
        tasksList.innerHTML = '<p class="no-data">No active tasks found</p>';
    } else {
        let html = '<div class="task-list">';
        tasks.forEach(task => {
            const statusClass = task.status === 'In Progress' ? 'in-progress' :
                               task.status === 'Todo' ? 'todo' : 'other';
            html += `
                <div class="task-item">
                    <a href="${task.url}" target="_blank" class="task-link">
                        <span class="task-number">#${task.number}</span>
                        <span class="task-title">${task.title}</span>
                    </a>
                    <span class="task-status ${statusClass}">${task.status}</span>
                </div>
            `;
        });
        html += '</div>';
        tasksList.innerHTML = html;
    }

    modal.classList.remove('hidden');

    // Close on backdrop click
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeAssigneeModal();
        }
    };
}

function closeAssigneeModal() {
    const modal = document.getElementById('assignee-modal');
    modal.classList.add('hidden');
}

// Pull Requests visualization
function updatePullRequests(prData) {
    const container = document.getElementById('pr-content');

    if (!prData || prData.length === 0) {
        container.innerHTML = '<p class="no-data">No open pull requests</p>';
        return;
    }

    let html = `
        <table class="pr-table">
            <thead>
                <tr>
                    <th>PR</th>
                    <th>Title</th>
                    <th>Author</th>
                    <th>Repository</th>
                    <th>Age</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    prData.forEach(pr => {
        const ageDisplay = formatAge(pr.ageHours);
        const lateClass = pr.isLate ? 'pr-late' : '';
        const lateBadge = pr.isLate ? '<span class="late-badge">LATE</span>' : '<span class="ok-badge">OK</span>';

        html += `
            <tr class="${lateClass}">
                <td><a href="${pr.url}" target="_blank">#${pr.number}</a></td>
                <td class="pr-title">${pr.title}</td>
                <td>@${pr.author || 'unknown'}</td>
                <td>${pr.repository || '-'}</td>
                <td class="pr-age">${ageDisplay}</td>
                <td>${lateBadge}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function formatAge(hours) {
    if (hours < 1) {
        return '< 1h';
    } else if (hours < 24) {
        return `${Math.round(hours)}h`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = Math.round(hours % 24);
        if (remainingHours === 0) {
            return `${days}d`;
        }
        return `${days}d ${remainingHours}h`;
    }
}
