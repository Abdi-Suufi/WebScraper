// First, let's create a configManager.js file to handle saving and loading configuration

// configManager.js
const fs = require('fs');
const path = require('path');
const electron = require('electron');
const app = electron.app || (electron.remote && electron.remote.app);

class ConfigManager {
  constructor() {
    // Get the user data directory for the app
    this.userDataPath = app ? app.getPath('userData') : path.join(__dirname, 'userData');
    this.configFilePath = path.join(this.userDataPath, 'config.json');
    
    // Default configuration
    this.defaultConfig = {
      jobTypes: ['software developer', 'data analyst', 'frontend developer'],
      locations: ['Bristol'],
      sources: ['indeed', 'linkedin', 'glassdoor'],
      saveDirectory: path.join(this.userDataPath, 'job_results'),
      notifyOnNewJobs: true,
      searchIntervalMinutes: 60
    };
  }

  // Load config from file or return default if not found
  loadConfig() {
    try {
      // Ensure the user data directory exists
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      
      // Check if config file exists
      if (fs.existsSync(this.configFilePath)) {
        const data = fs.readFileSync(this.configFilePath, 'utf8');
        const config = JSON.parse(data);
        console.log('Configuration loaded from:', this.configFilePath);
        return config;
      }
      
      // If no config file exists, create one with default settings
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (error) {
      console.error('Error loading configuration:', error);
      return this.defaultConfig;
    }
  }

  // Save config to file
  saveConfig(config) {
    try {
      // Ensure the user data directory exists
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      console.log('Configuration saved to:', this.configFilePath);
      return true;
    } catch (error) {
      console.error('Error saving configuration:', error);
      return false;
    }
  }
}

module.exports = ConfigManager;