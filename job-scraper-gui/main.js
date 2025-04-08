// main.js - Keep only main process code here
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification } = require('electron');
const path = require('path');
const JobScraper = require('./jobScraper'); // Your existing JobScraper class
const ConfigManager = require('./configManager'); // Our new ConfigManager class

let mainWindow;
let scraper;
let configManager;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 1000,
    minHeight: 700,
     icon: __dirname + '/icon.png',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
  mainWindow.on('close', function (event) {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  // Create tray icon
  createTray();
}

function createTray() {
  // Path to your icon (create a 16x16 or 32x32 icon and save it in your project)
  const iconPath = path.join(__dirname, 'icon.png'); // Make sure to add an icon.png file
  
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App', 
      click: function() {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: function() {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Job Scraper');
  tray.setContextMenu(contextMenu);
  
  // Double click to show the window
  tray.on('double-click', () => {
    mainWindow.show();
  });
}

app.on('ready', async () => {
  createWindow();
  
  // Initialize config manager and load saved configuration
  configManager = new ConfigManager();
  const savedConfig = configManager.loadConfig();
  
  // Initialize scraper with saved config
  scraper = new JobScraper(savedConfig);
  
  // Wait for the window to finish loading before sending data and performing initial search
  mainWindow.webContents.on('did-finish-load', async () => {
    // Send the current config to the renderer
    mainWindow.webContents.send('current-config', scraper.config);
    
    // Perform initial search
    try {
      // Set status to "Searching..."
      mainWindow.webContents.send('status-update', 'Searching...');
      
      // Perform the search
      await scraper.searchAllJobs();
      
      // Send the results to the renderer
      const jobs = scraper.getAllJobs();
      const newJobsCount = scraper.getNewJobsCount();
      
      // Send notification about search results
      new Notification({
        title: 'Job Search Complete',
        body: newJobsCount > 0 
          ? `Found ${newJobsCount} new job${newJobsCount === 1 ? '' : 's'}!` 
          : 'No new jobs found.',
        icon: path.join(__dirname, 'icon.png')
      }).show();
      
      mainWindow.webContents.send('search-complete', {
        success: true,
        jobs: jobs,
        newJobsCount: newJobsCount
      });
    } catch (error) {
      mainWindow.webContents.send('search-complete', {
        success: false,
        error: error.message
      });
    }
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
    const newJobsCount = scraper.getNewJobsCount();
    
    // Send notification about search results
    new Notification({
      title: 'Job Search Complete',
      body: newJobsCount > 0 
        ? `Found ${newJobsCount} new job${newJobsCount === 1 ? '' : 's'}!` 
        : 'No new jobs found.',
      icon: path.join(__dirname, 'icon.png')
    }).show();
    
    event.reply('search-complete', { 
      success: true, 
      jobs: jobs,
      newJobsCount: newJobsCount
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