// Automatic Job Search Web Scraper
// This script searches for multiple job types automatically every hour

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class JobScraper {
  constructor(config) {
    this.jobs = {};  // Object to store jobs by job type
    this.config = config || {
      jobTypes: ['software developer', 'data analyst', 'project manager'],
      locations: ['remote'],
      sources: ['indeed', 'linkedin', 'glassdoor'],
      saveDirectory: './job_results',
      notifyOnNewJobs: true,
      searchIntervalMinutes: 60
    };
    
    this.previousJobs = {}; // To track which jobs are new, organized by job type
    this.sources = {
      indeed: {
        baseUrl: 'https://www.indeed.com/jobs',
        scrapeFunction: this.scrapeIndeed.bind(this)
      },
      linkedin: {
        baseUrl: 'https://www.linkedin.com/jobs/search',
        scrapeFunction: this.scrapeLinkedin.bind(this)
      },
      glassdoor: {
        baseUrl: 'https://www.glassdoor.com/Job',
        scrapeFunction: this.scrapeGlassdoor.bind(this)
      }
    };
    
    // Ensure saveDirectory exists
    if (!fs.existsSync(this.config.saveDirectory)) {
      fs.mkdirSync(this.config.saveDirectory, { recursive: true });
    }
    
    // Initialize job arrays for each job type
    this.config.jobTypes.forEach(jobType => {
      this.jobs[jobType] = [];
      this.previousJobs[jobType] = new Set();
    });
    
    // Load previous jobs if they exist
    this.loadPreviousJobs();
  }

  loadPreviousJobs() {
    // For each job type, try to load previous jobs
    this.config.jobTypes.forEach(jobType => {
      const latestFile = this.getMostRecentFile(jobType);
      if (latestFile) {
        try {
          const data = fs.readFileSync(latestFile, 'utf8');
          const previousJobs = JSON.parse(data);
          previousJobs.forEach(job => {
            // Create a unique identifier for each job
            this.previousJobs[jobType].add(`${job.title}_${job.company}_${job.location}`);
          });
          console.log(`Loaded ${this.previousJobs[jobType].size} previous jobs for "${jobType}" from ${path.basename(latestFile)}`);
        } catch (error) {
          console.error(`Error loading previous jobs for "${jobType}":`, error.message);
        }
      }
    });
  }

  getMostRecentFile(jobType) {
    const jobTypeDir = path.join(this.config.saveDirectory, jobType.replace(/\s+/g, '_'));
    
    if (!fs.existsSync(jobTypeDir)) return null;
    
    const files = fs.readdirSync(jobTypeDir)
      .filter(file => file.endsWith('.json') && file !== 'latest.json')
      .map(file => path.join(jobTypeDir, file));
    
    if (files.length === 0) return null;
    
    // Sort by modification time (newest first)
    files.sort((a, b) => {
      return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
    });
    
    return files[0];
  }

  async scrapeIndeed(jobType, location) {
    try {
      const formattedJobType = jobType.replace(/\s+/g, '+');
      const formattedLocation = location.replace(/\s+/g, '+');
      const url = `${this.sources.indeed.baseUrl}?q=${formattedJobType}&l=${formattedLocation}`;
      
      console.log(`Scraping Indeed for ${jobType} jobs in ${location}...`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      $('.jobsearch-ResultsList > div').each((i, element) => {
        // This selector may need updating as Indeed's structure changes
        const titleElement = $(element).find('.jobTitle span');
        const companyElement = $(element).find('.companyName');
        const locationElement = $(element).find('.companyLocation');
        const salaryElement = $(element).find('.salary-snippet');
        const linkElement = $(element).find('.jobTitle a');
        
        if (titleElement.length) {
          const job = {
            title: titleElement.text().trim(),
            company: companyElement.text().trim(),
            location: locationElement.text().trim(),
            salary: salaryElement.length ? salaryElement.text().trim() : 'Not specified',
            link: 'https://www.indeed.com' + linkElement.attr('href'),
            source: 'Indeed',
            searchedJobType: jobType,
            timestamp: new Date().toISOString()
          };
          
          // Check if this is a new job
          const jobIdentifier = `${job.title}_${job.company}_${job.location}`;
          job.isNew = !this.previousJobs[jobType].has(jobIdentifier);
          
          this.jobs[jobType].push(job);
        }
      });
      
      console.log(`Found ${this.jobs[jobType].length} jobs on Indeed for "${jobType}"`);
    } catch (error) {
      console.error(`Error scraping Indeed for "${jobType}":`, error.message);
    }
  }
  
  async scrapeLinkedin(jobType, location) {
    try {
      const formattedJobType = jobType.replace(/\s+/g, '%20');
      const formattedLocation = location.replace(/\s+/g, '%20');
      const url = `${this.sources.linkedin.baseUrl}?keywords=${formattedJobType}&location=${formattedLocation}`;
      
      console.log(`Scraping LinkedIn for ${jobType} jobs in ${location}...`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      $('.jobs-search__results-list li').each((i, element) => {
        const titleElement = $(element).find('.base-search-card__title');
        const companyElement = $(element).find('.base-search-card__subtitle');
        const locationElement = $(element).find('.job-search-card__location');
        const linkElement = $(element).find('a.base-card__full-link');
        
        if (titleElement.length) {
          const job = {
            title: titleElement.text().trim(),
            company: companyElement.text().trim(),
            location: locationElement.text().trim(),
            salary: 'Not specified',
            link: linkElement.attr('href'),
            source: 'LinkedIn',
            searchedJobType: jobType,
            timestamp: new Date().toISOString()
          };
          
          // Check if this is a new job
          const jobIdentifier = `${job.title}_${job.company}_${job.location}`;
          job.isNew = !this.previousJobs[jobType].has(jobIdentifier);
          
          this.jobs[jobType].push(job);
        }
      });
      
      console.log(`Found ${this.jobs[jobType].length} jobs on LinkedIn for "${jobType}"`);
    } catch (error) {
      console.error(`Error scraping LinkedIn for "${jobType}":`, error.message);
    }
  }
  
  async scrapeGlassdoor(jobType, location) {
    try {
      const formattedJobType = jobType.replace(/\s+/g, '-');
      const formattedLocation = location.replace(/\s+/g, '-');
      const url = `${this.sources.glassdoor.baseUrl}/${formattedJobType}-jobs-${formattedLocation}.htm`;
      
      console.log(`Scraping Glassdoor for ${jobType} jobs in ${location}...`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      $('.react-job-listing').each((i, element) => {
        const titleElement = $(element).find('.jobLink span');
        const companyElement = $(element).find('.jobLink .companyName');
        const locationElement = $(element).find('.loc');
        const jobLinkElement = $(element).find('a.jobLink');
        
        if (titleElement.length) {
          const job = {
            title: titleElement.first().text().trim(),
            company: companyElement.text().trim(),
            location: locationElement.text().trim(),
            salary: 'Not specified',
            link: 'https://www.glassdoor.com' + jobLinkElement.attr('href'),
            source: 'Glassdoor',
            searchedJobType: jobType,
            timestamp: new Date().toISOString()
          };
          
          // Check if this is a new job
          const jobIdentifier = `${job.title}_${job.company}_${job.location}`;
          job.isNew = !this.previousJobs[jobType].has(jobIdentifier);
          
          this.jobs[jobType].push(job);
        }
      });
      
      console.log(`Found ${this.jobs[jobType].length} jobs on Glassdoor for "${jobType}"`);
    } catch (error) {
      console.error(`Error scraping Glassdoor for "${jobType}":`, error.message);
    }
  }
  
  async searchAllJobs() {
    // For each job type and location combination
    for (const jobType of this.config.jobTypes) {
      // Reset jobs array for this job type
      this.jobs[jobType] = [];
      
      for (const location of this.config.locations) {
        console.log(`\n[${new Date().toLocaleString()}] Starting job search for "${jobType}" in ${location}`);
        
        const scrapePromises = [];
        for (const source of this.config.sources) {
          if (this.sources[source]) {
            scrapePromises.push(this.sources[source].scrapeFunction(jobType, location));
          } else {
            console.warn(`Source "${source}" is not supported.`);
          }
        }
        
        await Promise.all(scrapePromises);
      }
      
      // Find new jobs for this job type
      const newJobs = this.jobs[jobType].filter(job => job.isNew);
      if (newJobs.length > 0 && this.config.notifyOnNewJobs) {
        console.log(`\n===== ${newJobs.length} NEW JOBS FOUND FOR "${jobType}"! =====`);
        newJobs.forEach((job, index) => {
          console.log(`\n[${index + 1}] ${job.title} (NEW!)`);
          console.log(`   Job Type: ${job.searchedJobType}`);
          console.log(`   Company: ${job.company}`);
          console.log(`   Location: ${job.location}`);
          console.log(`   Source: ${job.source}`);
          console.log(`   Link: ${job.link}`);
        });
      }
      
      // Update previous jobs
      this.jobs[jobType].forEach(job => {
        const jobIdentifier = `${job.title}_${job.company}_${job.location}`;
        this.previousJobs[jobType].add(jobIdentifier);
      });
      
      // Save jobs for this job type
      this.saveJobsToFile(jobType);
    }
    
    return this.jobs;
  }
  
  saveJobsToFile(jobType) {
    // Create directory for this job type if it doesn't exist
    const jobTypeDir = path.join(this.config.saveDirectory, jobType.replace(/\s+/g, '_'));
    if (!fs.existsSync(jobTypeDir)) {
      fs.mkdirSync(jobTypeDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = path.join(jobTypeDir, `job_results_${timestamp}.json`);
    
    fs.writeFileSync(filename, JSON.stringify(this.jobs[jobType], null, 2));
    console.log(`Saved ${this.jobs[jobType].length} jobs for "${jobType}" to ${filename}`);
    
    // Also save a "latest.json" file
    const latestFile = path.join(jobTypeDir, 'latest.json');
    fs.writeFileSync(latestFile, JSON.stringify(this.jobs[jobType], null, 2));
  }
  
  updateConfig(newConfig) {
    // Handle special case for adding new job types
    if (newConfig.addJobType) {
      const newJobType = newConfig.addJobType;
      if (!this.config.jobTypes.includes(newJobType)) {
        this.config.jobTypes.push(newJobType);
        this.jobs[newJobType] = [];
        this.previousJobs[newJobType] = new Set();
        console.log(`Added new job type: "${newJobType}"`);
      } else {
        console.log(`Job type "${newJobType}" already exists in the configuration.`);
      }
      delete newConfig.addJobType;
    }
    
    // Handle special case for removing job types
    if (newConfig.removeJobType) {
      const jobTypeToRemove = newConfig.removeJobType;
      const index = this.config.jobTypes.indexOf(jobTypeToRemove);
      if (index !== -1) {
        this.config.jobTypes.splice(index, 1);
        delete this.jobs[jobTypeToRemove];
        delete this.previousJobs[jobTypeToRemove];
        console.log(`Removed job type: "${jobTypeToRemove}"`);
      } else {
        console.log(`Job type "${jobTypeToRemove}" not found in the configuration.`);
      }
      delete newConfig.removeJobType;
    }
    
    // Handle special case for adding new locations
    if (newConfig.addLocation) {
      const newLocation = newConfig.addLocation;
      if (!this.config.locations.includes(newLocation)) {
        this.config.locations.push(newLocation);
        console.log(`Added new location: "${newLocation}"`);
      } else {
        console.log(`Location "${newLocation}" already exists in the configuration.`);
      }
      delete newConfig.addLocation;
    }
    
    // Handle special case for removing locations
    if (newConfig.removeLocation) {
      const locationToRemove = newConfig.removeLocation;
      const index = this.config.locations.indexOf(locationToRemove);
      if (index !== -1) {
        this.config.locations.splice(index, 1);
        console.log(`Removed location: "${locationToRemove}"`);
      } else {
        console.log(`Location "${locationToRemove}" not found in the configuration.`);
      }
      delete newConfig.removeLocation;
    }
    
    // Update the rest of the config
    this.config = { ...this.config, ...newConfig };
    console.log('Configuration updated:', this.config);
    return this.config;
  }
  
  getNewJobsCount() {
    let totalNewJobs = 0;
    for (const jobType of this.config.jobTypes) {
      if (this.jobs[jobType]) {
        totalNewJobs += this.jobs[jobType].filter(job => job.isNew).length;
      }
    }
    return totalNewJobs;
  }
  
  getAllJobs() {
    const allJobs = [];
    for (const jobType of this.config.jobTypes) {
      if (this.jobs[jobType]) {
        allJobs.push(...this.jobs[jobType]);
      }
    }
    return allJobs;
  }
}

// Automated job search function
async function startAutomaticJobSearch(config) {
  const scraper = new JobScraper(config);
  
  // Initial search
  await scraper.searchAllJobs();
  
  // Set up periodic searches
  const intervalMinutes = config.searchIntervalMinutes || 60;
  setInterval(async () => {
    await scraper.searchAllJobs();
  }, intervalMinutes * 60 * 1000); // Convert minutes to milliseconds
  
  console.log(`\nAutomatic job search started. Will search for ${config.jobTypes.length} job types every ${intervalMinutes} minutes.`);
  console.log('Press Ctrl+C to stop the program.');
  
  // Allow configuration updates via stdin
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (data) => {
    const input = data.trim();
    
    if (input.startsWith('add:')) {
      const newJobType = input.replace('add:', '').trim();
      scraper.updateConfig({ addJobType: newJobType });
      await scraper.searchAllJobs(); // Run a search with new config immediately
    } 
    else if (input.startsWith('remove:')) {
      const jobTypeToRemove = input.replace('remove:', '').trim();
      scraper.updateConfig({ removeJobType: jobTypeToRemove });
    }
    else if (input.startsWith('addLocation:')) {
      const newLocation = input.replace('addLocation:', '').trim();
      scraper.updateConfig({ addLocation: newLocation });
      await scraper.searchAllJobs();
    }
    else if (input.startsWith('removeLocation:')) {
      const locationToRemove = input.replace('removeLocation:', '').trim();
      scraper.updateConfig({ removeLocation: locationToRemove });
    }
    else if (input.startsWith('interval:')) {
      const newInterval = parseInt(input.replace('interval:', '').trim());
      if (!isNaN(newInterval) && newInterval > 0) {
        scraper.updateConfig({ searchIntervalMinutes: newInterval });
        console.log(`Search interval updated to ${newInterval} minutes.`);
      } else {
        console.log('Invalid interval. Please enter a positive number of minutes.');
      }
    }
    else if (input === 'search') {
      console.log('Running manual search...');
      await scraper.searchAllJobs();
    }
    else if (input === 'help') {
      console.log('\nCommands:');
      console.log('  add:[job type] - Add a new job type to search for');
      console.log('  remove:[job type] - Remove a job type from the search');
      console.log('  addLocation:[location] - Add a new location to search in');
      console.log('  removeLocation:[location] - Remove a location from the search');
      console.log('  interval:[minutes] - Change the automatic search interval');
      console.log('  search - Run a manual search immediately');
      console.log('  config - Show current configuration');
      console.log('  help - Show this help message');
      console.log('  jobs - Show summary of all jobs found');
    }
    else if (input === 'config') {
      console.log('\nCurrent configuration:');
      console.log(JSON.stringify(scraper.config, null, 2));
    }
    else if (input === 'jobs') {
      const allJobs = scraper.getAllJobs();
      console.log(`\nTotal jobs found: ${allJobs.length}`);
      console.log(`New jobs found: ${scraper.getNewJobsCount()}`);
      
      console.log('\nJobs by type:');
      for (const jobType of scraper.config.jobTypes) {
        if (scraper.jobs[jobType]) {
          const newJobsCount = scraper.jobs[jobType].filter(job => job.isNew).length;
          console.log(`  ${jobType}: ${scraper.jobs[jobType].length} total, ${newJobsCount} new`);
        }
      }
    }
    else {
      console.log('Unknown command. Type "help" for available commands.');
    }
  });
  
  console.log('\nAvailable commands:');
  console.log('  add:[job type] - Add a new job type to search for');
  console.log('  remove:[job type] - Remove a job type from the search');
  console.log('  addLocation:[location] - Add a new location to search in');
  console.log('  removeLocation:[location] - Remove a location from the search');
  console.log('  interval:[minutes] - Change the automatic search interval');
  console.log('  search - Run a manual search immediately');
  console.log('  config - Show current configuration');
  console.log('  help - Show available commands');
  console.log('  jobs - Show summary of all jobs found');
}

// Configuration
const config = {
  jobTypes: ['software developer', 'data analyst', 'frontend developer'], // Multiple job types to search for
  locations: ['Bristol'], // Multiple locations to search in
  sources: ['indeed', 'linkedin', 'glassdoor'], // Sources to search
  saveDirectory: './job_results', // Directory to save results
  notifyOnNewJobs: true, // Whether to print new jobs in console
  searchIntervalMinutes: 60 // How often to search (in minutes)
};

// Start the automatic job search
startAutomaticJobSearch(config);

/* 
  To manage job types while the program is running:
  - Type "add:machine learning engineer" to add a new job type
  - Type "remove:software developer" to remove a job type
  - Type "addLocation:Chicago" to add a new location
  - Type "removeLocation:remote" to remove a location
  - Type "interval:30" to change search frequency to 30 minutes
  - Type "search" to run a manual search immediately
  - Type "config" to see current configuration
  - Type "jobs" to see job counts
  - Type "help" to see all available commands
*/

module.exports = JobScraper;