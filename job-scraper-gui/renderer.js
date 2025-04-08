const { ipcRenderer } = require('electron');

let autoSearchInterval;
let currentJobs = [];

document.addEventListener('DOMContentLoaded', () => {
    // Load initial config
    ipcRenderer.send('get-config');
    
    // Set up event listeners
    document.getElementById('startSearch').addEventListener('click', startSearch);
    document.getElementById('stopSearch').addEventListener('click', stopAutoSearch);
    document.getElementById('addJobType').addEventListener('click', addJobType);
    document.getElementById('addLocation').addEventListener('click', addLocation);
    document.getElementById('selectDirectory').addEventListener('click', selectDirectory);
    document.getElementById('searchInterval').addEventListener('change', updateInterval);
    
    // Set up IPC listeners
    ipcRenderer.on('current-config', (event, config) => {
        updateConfigUI(config);
    });
    
    ipcRenderer.on('search-complete', (event, result) => {
        if (result.success) {
            currentJobs = result.jobs;
            updateJobList(currentJobs);
            document.getElementById('totalJobs').textContent = currentJobs.length;
            document.getElementById('newJobs').textContent = result.newJobsCount;
            document.getElementById('statusText').textContent = 'Search completed';
            document.getElementById('statusText').style.color = '#27ae60';
            
            // If this was an automatic search, schedule the next one
            if (autoSearchInterval) {
                const interval = parseInt(document.getElementById('searchInterval').value) || 60;
                clearInterval(autoSearchInterval);
                autoSearchInterval = setInterval(startSearch, interval * 60 * 1000);
            }
        } else {
            document.getElementById('statusText').textContent = 'Error: ' + result.error;
            document.getElementById('statusText').style.color = '#e74c3c';
        }
    });
    
    ipcRenderer.on('config-updated', (event, result) => {
        if (result.success) {
            updateConfigUI(result.config);
        } else {
            alert('Error updating config: ' + result.error);
        }
    });
    
    ipcRenderer.on('directory-selected', (event, path) => {
        document.getElementById('saveDirectory').value = path;
        updateConfig({ saveDirectory: path });
    });
    
    ipcRenderer.on('current-jobs', (event, data) => {
        currentJobs = data.jobs;
        updateJobList(currentJobs);
        document.getElementById('totalJobs').textContent = currentJobs.length;
        document.getElementById('newJobs').textContent = data.newJobsCount;
    });
});

function startSearch() {
    document.getElementById('statusText').textContent = 'Searching...';
    document.getElementById('statusText').style.color = '#f39c12';
    
    // Update config from UI
    const newConfig = {
        searchIntervalMinutes: parseInt(document.getElementById('searchInterval').value) || 60,
        notifyOnNewJobs: document.getElementById('notifyOnNewJobs').checked,
        sources: Array.from(document.querySelectorAll('input[name="source"]:checked')).map(el => el.value)
    };
    
    updateConfig(newConfig);
    
    // Start the search
    ipcRenderer.send('start-search');
    
    // Set up automatic searches if not already running
    if (!autoSearchInterval) {
        const interval = parseInt(document.getElementById('searchInterval').value) || 60;
        autoSearchInterval = setInterval(startSearch, interval * 60 * 1000);
    }
}

function stopAutoSearch() {
    if (autoSearchInterval) {
        clearInterval(autoSearchInterval);
        autoSearchInterval = null;
        document.getElementById('statusText').textContent = 'Auto search stopped';
    }
}

function updateConfig(newConfig) {
    ipcRenderer.send('update-config', newConfig);
}

function updateConfigUI(config) {
    document.getElementById('searchInterval').value = config.searchIntervalMinutes;
    document.getElementById('saveDirectory').value = config.saveDirectory;
    document.getElementById('notifyOnNewJobs').checked = config.notifyOnNewJobs;
    
    // Update sources checkboxes
    document.querySelectorAll('input[name="source"]').forEach(checkbox => {
        checkbox.checked = config.sources.includes(checkbox.value);
    });
    
    // Update job types list
    const jobTypesList = document.getElementById('jobTypesList');
    jobTypesList.innerHTML = '';
    config.jobTypes.forEach(jobType => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <span>${jobType}</span>
            <button class="remove-job-type" data-jobtype="${jobType}">×</button>
        `;
        jobTypesList.appendChild(item);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-job-type').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            updateConfig({ removeJobType: button.dataset.jobtype });
        });
    });
    
    // Update locations list
    const locationsList = document.getElementById('locationsList');
    locationsList.innerHTML = '';
    config.locations.forEach(location => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <span>${location}</span>
            <button class="remove-location" data-location="${location}">×</button>
        `;
        locationsList.appendChild(item);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-location').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            updateConfig({ removeLocation: button.dataset.location });
        });
    });
}

function addJobType() {
    const input = document.getElementById('newJobType');
    if (input.value.trim()) {
        updateConfig({ addJobType: input.value.trim() });
        input.value = '';
    }
}

function addLocation() {
    const input = document.getElementById('newLocation');
    if (input.value.trim()) {
        updateConfig({ addLocation: input.value.trim() });
        input.value = '';
    }
}

function selectDirectory() {
    ipcRenderer.send('select-directory');
}

function updateInterval() {
    const interval = parseInt(document.getElementById('searchInterval').value) || 60;
    updateConfig({ searchIntervalMinutes: interval });
    
    // Restart auto search with new interval if it was running
    if (autoSearchInterval) {
        clearInterval(autoSearchInterval);
        autoSearchInterval = setInterval(startSearch, interval * 60 * 1000);
    }
}

function updateJobList(jobs) {
    const jobList = document.getElementById('jobList');
    jobList.innerHTML = '';
    
    jobs.forEach(job => {
        const item = document.createElement('div');
        item.className = `job-item ${job.isNew ? 'new' : ''}`;
        item.innerHTML = `
            <div><a href="#" class="job-link" data-link="${job.link}">${job.title}</a></div>
            <div>${job.company}</div>
            <div>${job.location}</div>
            <div>${job.source}</div>
            <div>${job.isNew ? '<span class="new-badge">NEW</span>' : ''}</div>
        `;
        jobList.appendChild(item);
    });
    
    // Add click handlers for job links
    document.querySelectorAll('.job-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            require('electron').shell.openExternal(link.dataset.link);
        });
    });
}