const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const JobScraper = require('./jobScraper'); // Your existing JobScraper class

let mainWindow;
let scraper;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();
  
  // Initialize scraper with default config
  scraper = new JobScraper({
    jobTypes: ['software developer', 'data analyst', 'frontend developer'],
    locations: ['Bristol'],
    sources: ['indeed', 'linkedin', 'glassdoor'],
    saveDirectory: './job_results',
    notifyOnNewJobs: true,
    searchIntervalMinutes: 60
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// IPC Communication
ipcMain.on('start-search', async (event) => {
  try {
    await scraper.searchAllJobs();
    const jobs = scraper.getAllJobs();
    event.reply('search-complete', { 
      success: true, 
      jobs: jobs,
      newJobsCount: scraper.getNewJobsCount()
    });
  } catch (error) {
    event.reply('search-complete', { success: false, error: error.message });
  }
});

ipcMain.on('update-config', (event, newConfig) => {
  try {
    const updatedConfig = scraper.updateConfig(newConfig);
    event.reply('config-updated', { success: true, config: updatedConfig });
  } catch (error) {
    event.reply('config-updated', { success: false, error: error.message });
  }
});

ipcMain.on('get-config', (event) => {
  event.reply('current-config', scraper.config);
});

ipcMain.on('get-jobs', (event) => {
  const jobs = scraper.getAllJobs();
  event.reply('current-jobs', {
    jobs: jobs,
    newJobsCount: scraper.getNewJobsCount()
  });
});

ipcMain.on('select-directory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    event.reply('directory-selected', result.filePaths[0]);
  }
});