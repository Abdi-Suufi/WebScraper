const { ipcRenderer, shell } = require('electron');

let autoSearchInterval;
let currentJobs = [];

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    bindIpcEvents();
    ipcRenderer.send('get-config');
});

function bindEvents() {
    document.getElementById('startSearch').addEventListener('click', startSearch);
    document.getElementById('stopSearch').addEventListener('click', stopAutoSearch);
    document.getElementById('addJobType').addEventListener('click', addJobType);
    document.getElementById('addLocation').addEventListener('click', addLocation);
    document.getElementById('selectDirectory').addEventListener('click', selectDirectory);
    document.getElementById('searchInterval').addEventListener('change', updateInterval);

    document.getElementById('newJobType').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') addJobType();
    });

    document.getElementById('newLocation').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') addLocation();
    });
}

function bindIpcEvents() {
    ipcRenderer.on('current-config', (event, config) => {
        updateConfigUI(config);
    });

    ipcRenderer.on('status-update', (event, status) => {
        setStatus(status, 'searching');
    });

    ipcRenderer.on('search-complete', (event, result) => {
        hideLoadingOverlay();

        if (result.success) {
            currentJobs = Array.isArray(result.jobs) ? result.jobs : [];
            updateJobList(currentJobs);
            updateCounts(currentJobs.length, result.newJobsCount || 0);
            setStatus('Search completed', 'completed');

            if (autoSearchInterval) {
                scheduleAutoSearch();
            }

            if (result.newJobsCount > 0) {
                showNotification(`Found ${result.newJobsCount} new job(s)!`);
            }
        } else {
            setStatus('Search failed', 'error');
            showNotification(result.error || 'Search failed', 'error');
            console.error('Search error:', result.error);
        }
    });

    ipcRenderer.on('config-updated', (event, result) => {
        if (result.success) {
            updateConfigUI(result.config);
        } else {
            showNotification('Error updating configuration', 'error');
        }
    });

    ipcRenderer.on('directory-selected', (event, selectedPath) => {
        document.getElementById('saveDirectory').value = selectedPath;
        updateConfig({ saveDirectory: selectedPath });
    });

    ipcRenderer.on('current-jobs', (event, data) => {
        currentJobs = Array.isArray(data.jobs) ? data.jobs : [];
        updateJobList(currentJobs);
        updateCounts(currentJobs.length, data.newJobsCount || 0);
    });
}

function startSearch() {
    const startButton = document.getElementById('startSearch');
    setStatus('Searching...', 'searching');
    startButton.classList.add('is-busy');
    setTimeout(() => startButton.classList.remove('is-busy'), 1800);

    updateConfig({
        searchIntervalMinutes: getInterval(),
        notifyOnNewJobs: document.getElementById('notifyOnNewJobs').checked,
        sources: Array.from(document.querySelectorAll('input[name="source"]:checked')).map((el) => el.value)
    });

    ipcRenderer.send('start-search');

    if (!autoSearchInterval) {
        scheduleAutoSearch();
        showNotification(`Auto search enabled. Running every ${getInterval()} minutes.`);
    }
}

function stopAutoSearch() {
    if (!autoSearchInterval) {
        setStatus('Ready', '');
        return;
    }

    clearInterval(autoSearchInterval);
    autoSearchInterval = null;
    setStatus('Auto search stopped', '');
    showNotification('Auto search stopped');
}

function scheduleAutoSearch() {
    if (autoSearchInterval) {
        clearInterval(autoSearchInterval);
    }

    autoSearchInterval = setInterval(startSearch, getInterval() * 60 * 1000);
}

function updateConfig(newConfig) {
    ipcRenderer.send('update-config', newConfig);
}

function updateConfigUI(config) {
    document.getElementById('searchInterval').value = config.searchIntervalMinutes;
    document.getElementById('saveDirectory').value = config.saveDirectory;
    document.getElementById('notifyOnNewJobs').checked = config.notifyOnNewJobs;

    document.querySelectorAll('input[name="source"]').forEach((checkbox) => {
        checkbox.checked = config.sources.includes(checkbox.value);
    });

    renderEditableList('jobTypesList', config.jobTypes, 'remove-job-type', 'data-jobtype');
    renderEditableList('locationsList', config.locations, 'remove-location', 'data-location');

    document.querySelectorAll('.remove-job-type').forEach((button) => {
        button.addEventListener('click', () => {
            const jobType = button.dataset.jobtype;
            updateConfig({ removeJobType: jobType });
            showNotification(`Removed job type: ${jobType}`);
        });
    });

    document.querySelectorAll('.remove-location').forEach((button) => {
        button.addEventListener('click', () => {
            const location = button.dataset.location;
            updateConfig({ removeLocation: location });
            showNotification(`Removed location: ${location}`);
        });
    });
}

function renderEditableList(elementId, values, removeClass, dataAttribute) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';

    values.forEach((value) => {
        const item = document.createElement('div');
        item.className = 'list-item';

        const label = document.createElement('span');
        label.textContent = value;

        const button = document.createElement('button');
        button.className = removeClass;
        button.type = 'button';
        button.title = `Remove ${value}`;
        button.setAttribute(dataAttribute, value);
        button.innerHTML = '<i class="fas fa-xmark"></i>';

        item.append(label, button);
        list.appendChild(item);
    });
}

function addJobType() {
    const input = document.getElementById('newJobType');
    const jobType = input.value.trim();

    if (jobType) {
        updateConfig({ addJobType: jobType });
        input.value = '';
        showNotification(`Added job type: ${jobType}`);
    }
}

function addLocation() {
    const input = document.getElementById('newLocation');
    const location = input.value.trim();

    if (location) {
        updateConfig({ addLocation: location });
        input.value = '';
        showNotification(`Added location: ${location}`);
    }
}

function selectDirectory() {
    ipcRenderer.send('select-directory');
}

function updateInterval() {
    const interval = getInterval();
    updateConfig({ searchIntervalMinutes: interval });

    if (autoSearchInterval) {
        scheduleAutoSearch();
        showNotification(`Search interval updated to ${interval} minutes`);
    }
}

function updateJobList(jobs) {
    const jobList = document.getElementById('jobList');
    jobList.innerHTML = '';

    if (!jobs.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<i class="fas fa-magnifying-glass-chart"></i><span>No jobs yet. Start a search to populate this board.</span>';
        jobList.appendChild(empty);
        return;
    }

    jobs.forEach((job) => {
        const item = document.createElement('div');
        item.className = `job-item ${job.isNew ? 'new fade-in' : ''}`;

        const title = document.createElement('div');
        title.className = 'job-title-cell';

        const link = document.createElement('a');
        link.href = '#';
        link.className = 'job-link';
        link.textContent = job.title || 'Untitled role';
        link.addEventListener('click', (event) => {
            event.preventDefault();
            if (job.link) shell.openExternal(job.link);
        });

        const meta = document.createElement('span');
        meta.className = 'job-meta';
        meta.textContent = job.searchedJobType || 'Tracked role';

        title.append(link, meta);
        item.append(
            title,
            createCell(job.company || 'Unknown company'),
            createCell(job.location || 'Unknown location'),
            createSourceCell(job.source),
            createStatusCell(job.isNew)
        );

        jobList.appendChild(item);
    });
}

function createCell(text) {
    const cell = document.createElement('div');
    cell.className = 'truncate-cell';
    cell.textContent = text;
    return cell;
}

function createSourceCell(source) {
    const cell = document.createElement('div');
    cell.className = 'source-cell';
    const normalizedSource = source || 'Unknown';
    const iconMap = {
        Indeed: 'fas fa-briefcase',
        LinkedIn: 'fab fa-linkedin',
        Glassdoor: 'fas fa-door-open'
    };

    const icon = document.createElement('i');
    icon.className = iconMap[normalizedSource] || 'fas fa-globe';

    const label = document.createElement('span');
    label.textContent = normalizedSource;

    cell.append(icon, label);
    return cell;
}

function createStatusCell(isNew) {
    const cell = document.createElement('div');
    cell.innerHTML = isNew ? '<span class="new-badge">New</span>' : '<span class="seen-badge">Seen</span>';
    return cell;
}

function updateCounts(total, newest) {
    document.getElementById('totalJobs').textContent = total;
    document.getElementById('newJobs').textContent = newest;
}

function setStatus(text, state) {
    const statusText = document.getElementById('statusText');
    statusText.textContent = text;
    statusText.className = state || '';
}

function getInterval() {
    const interval = parseInt(document.getElementById('searchInterval').value, 10);
    return Number.isFinite(interval) && interval > 0 ? interval : 60;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `toast ${type === 'error' ? 'toast-error' : 'toast-info'}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'circle-exclamation' : 'circle-info'}"></i>
        <span></span>
    `;
    notification.querySelector('span').textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('is-leaving');
        setTimeout(() => notification.remove(), 350);
    }, 3000);
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 600);
    }
}
