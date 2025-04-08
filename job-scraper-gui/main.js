const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const JobScraper = require('./jobScraper'); // Your existing JobScraper class
const ConfigManager = require('./configManager'); // Our new ConfigManager class

let mainWindow;
let scraper;
let configManager;

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
  
  // Initialize config manager and load saved configuration
  configManager = new ConfigManager();
  const savedConfig = configManager.loadConfig();
  
  // Initialize scraper with saved config
  scraper = new JobScraper(savedConfig);
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
    
    // Save the updated configuration
    configManager.saveConfig(updatedConfig);
    
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
    const newDirectory = result.filePaths[0];
    event.reply('directory-selected', newDirectory);
    
    // Save the directory to config when selected
    const updatedConfig = scraper.updateConfig({ saveDirectory: newDirectory });
    configManager.saveConfig(updatedConfig);
  }
});