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
    
    // Enter key handlers for input fields
    document.getElementById('newJobType').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addJobType();
    });
    
    document.getElementById('newLocation').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addLocation();
    });
    
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
            
            const statusText = document.getElementById('statusText');
            statusText.textContent = 'Search completed';
            statusText.className = 'completed';
            
            // If this was an automatic search, schedule the next one
            if (autoSearchInterval) {
                const interval = parseInt(document.getElementById('searchInterval').value) || 60;
                clearInterval(autoSearchInterval);
                autoSearchInterval = setInterval(startSearch, interval * 60 * 1000);
            }
            
            // Show notification for new jobs
            if (result.newJobsCount > 0) {
                showNotification(`Found ${result.newJobsCount} new job(s)!`);
            }
        } else {
            const statusText = document.getElementById('statusText');
            statusText.textContent = 'Error';
            statusText.className = 'error';
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
    const statusText = document.getElementById('statusText');
    statusText.textContent = 'Searching...';
    statusText.className = 'searching';
    
    // Apply pulse animation to button
    const startButton = document.getElementById('startSearch');
    startButton.classList.add('animate-pulse');
    setTimeout(() => startButton.classList.remove('animate-pulse'), 2000);
    
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
        showNotification(`Auto search enabled. Will search every ${interval} minutes.`);
    }
}

function stopAutoSearch() {
    if (autoSearchInterval) {
        clearInterval(autoSearchInterval);
        autoSearchInterval = null;
        
        const statusText = document.getElementById('statusText');
        statusText.textContent = 'Auto search stopped';
        statusText.className = '';
        
        showNotification('Auto search stopped');
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
            <button class="remove-job-type" data-jobtype="${jobType}" title="Remove job type">×</button>
        `;
        jobTypesList.appendChild(item);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-job-type').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const jobType = button.dataset.jobtype;
            updateConfig({ removeJobType: jobType });
            showNotification(`Removed job type: ${jobType}`);
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
            <button class="remove-location" data-location="${location}" title="Remove location">×</button>
        `;
        locationsList.appendChild(item);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-location').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const location = button.dataset.location;
            updateConfig({ removeLocation: location });
            showNotification(`Removed location: ${location}`);
        });
    });
}

function addJobType() {
    const input = document.getElementById('newJobType');
    if (input.value.trim()) {
        const jobType = input.value.trim();
        updateConfig({ addJobType: jobType });
        input.value = '';
        showNotification(`Added job type: ${jobType}`);
    }
}

function addLocation() {
    const input = document.getElementById('newLocation');
    if (input.value.trim()) {
        const location = input.value.trim();
        updateConfig({ addLocation: location });
        input.value = '';
        showNotification(`Added location: ${location}`);
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
        showNotification(`Search interval updated to ${interval} minutes`);
    }
}

function updateJobList(jobs) {
    const jobList = document.getElementById('jobList');
    jobList.innerHTML = '';
    
    jobs.forEach(job => {
        const item = document.createElement('div');
        item.className = `job-item ${job.isNew ? 'new fade-in' : ''}`;
        
        // Determine source icon
        let sourceIcon = '';
        if (job.source === 'Indeed') {
            sourceIcon = '<i class="fas fa-briefcase text-indigo-500 mr-2"></i>';
        } else if (job.source === 'LinkedIn') {
            sourceIcon = '<i class="fab fa-linkedin text-blue-600 mr-2"></i>';
        } else if (job.source === 'Glassdoor') {
            sourceIcon = '<i class="fas fa-door-open text-green-600 mr-2"></i>';
        }
        
        // Format with 6-column grid (matching header)
        item.innerHTML = `
            <div class="col-span-2 truncate">
                <a href="#" class="job-link" data-link="${job.link}">${job.title}</a>
            </div>
            <div class="truncate">${job.company}</div>
            <div class="truncate">${job.location}</div>
            <div>${sourceIcon}${job.source}</div>
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

// Simple notification function
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity duration-500 ${
        type === 'error' 
            ? 'bg-red-100 text-red-800 border-l-4 border-red-500' 
            : 'bg-indigo-100 text-indigo-800 border-l-4 border-indigo-500'
    }`;
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Fade out and remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
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

// Modify your existing IPC listener for search-complete
ipcRenderer.on('search-complete', (event, result) => {
    // Hide the loading overlay
    hideLoadingOverlay();
    
    if (result.success) {
        currentJobs = result.jobs;
        updateJobList(currentJobs);
        document.getElementById('totalJobs').textContent = currentJobs.length;
        document.getElementById('newJobs').textContent = result.newJobsCount;
        
        const statusText = document.getElementById('statusText');
        statusText.textContent = 'Search completed';
        statusText.className = 'completed';
        
        // If this was an automatic search, schedule the next one
        if (autoSearchInterval) {
            const interval = parseInt(document.getElementById('searchInterval').value) || 60;
            clearInterval(autoSearchInterval);
            autoSearchInterval = setInterval(startSearch, interval * 60 * 1000);
        }
        
        // Show notification for new jobs
        if (result.newJobsCount > 0) {
            showNotification(`Found ${result.newJobsCount} new job(s)!`);
        }
    } else {
        // Even if there was an error, we still hide the loading overlay
        const statusText = document.getElementById('statusText');
        statusText.textContent = 'Error';
        statusText.className = 'error';
        console.error('Search error:', result.error);
    }
});