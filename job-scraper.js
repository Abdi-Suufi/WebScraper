const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const readline = require('readline');

class JobScraper {
  constructor() {
    this.jobs = [];
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
          this.jobs.push({
            title: titleElement.text().trim(),
            company: companyElement.text().trim(),
            location: locationElement.text().trim(),
            salary: salaryElement.length ? salaryElement.text().trim() : 'Not specified',
            link: 'https://www.indeed.com' + linkElement.attr('href'),
            source: 'Indeed'
          });
        }
      });
      
      console.log(`Found ${this.jobs.length} jobs on Indeed`);
    } catch (error) {
      console.error('Error scraping Indeed:', error.message);
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
          this.jobs.push({
            title: titleElement.text().trim(),
            company: companyElement.text().trim(),
            location: locationElement.text().trim(),
            salary: 'Not specified',
            link: linkElement.attr('href'),
            source: 'LinkedIn'
          });
        }
      });
      
      console.log(`Found ${this.jobs.length} jobs on LinkedIn`);
    } catch (error) {
      console.error('Error scraping LinkedIn:', error.message);
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
          this.jobs.push({
            title: titleElement.first().text().trim(),
            company: companyElement.text().trim(),
            location: locationElement.text().trim(),
            salary: 'Not specified',
            link: 'https://www.glassdoor.com' + jobLinkElement.attr('href'),
            source: 'Glassdoor'
          });
        }
      });
      
      console.log(`Found ${this.jobs.length} jobs on Glassdoor`);
    } catch (error) {
      console.error('Error scraping Glassdoor:', error.message);
    }
  }
  
  async searchJobs(jobType, location, sources = ['indeed', 'linkedin', 'glassdoor']) {
    this.jobs = []; // Reset jobs array
    const scrapePromises = [];
    
    for (const source of sources) {
      if (this.sources[source]) {
        scrapePromises.push(this.sources[source].scrapeFunction(jobType, location));
      } else {
        console.warn(`Source "${source}" is not supported.`);
      }
    }
    
    await Promise.all(scrapePromises);
    return this.jobs;
  }
  
  saveJobsToFile(filename = 'job_results.json') {
    fs.writeFileSync(filename, JSON.stringify(this.jobs, null, 2));
    console.log(`Saved ${this.jobs.length} jobs to ${filename}`);
  }
  
  displayJobs() {
    console.log('\n===== JOB SEARCH RESULTS =====');
    if (this.jobs.length === 0) {
      console.log('No jobs found.');
      return;
    }
    
    this.jobs.forEach((job, index) => {
      console.log(`\n[${index + 1}] ${job.title}`);
      console.log(`   Company: ${job.company}`);
      console.log(`   Location: ${job.location}`);
      console.log(`   Salary: ${job.salary}`);
      console.log(`   Source: ${job.source}`);
      console.log(`   Link: ${job.link}`);
    });
  }
}

// Interactive CLI interface
async function runJobSearch() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const scraper = new JobScraper();
  
  console.log('===== JOB SEARCH SCRAPER =====');
  
  const askQuestion = (question) => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };
  
  while (true) {
    console.log('\n1. Search for jobs');
    console.log('2. Exit');
    
    const choice = await askQuestion('Choose an option (1-2): ');
    
    if (choice === '1') {
      const jobType = await askQuestion('Enter job type (e.g., "software developer"): ');
      const location = await askQuestion('Enter location (e.g., "New York"): ');
      
      console.log('\nSelect sources to search:');
      console.log('1. All sources');
      console.log('2. Indeed only');
      console.log('3. LinkedIn only');
      console.log('4. Glassdoor only');
      console.log('5. Custom selection');
      
      const sourceChoice = await askQuestion('Choose an option (1-5): ');
      let sources = [];
      
      switch (sourceChoice) {
        case '1':
          sources = ['indeed', 'linkedin', 'glassdoor'];
          break;
        case '2':
          sources = ['indeed'];
          break;
        case '3':
          sources = ['linkedin'];
          break;
        case '4':
          sources = ['glassdoor'];
          break;
        case '5':
          const customSources = await askQuestion('Enter sources separated by commas (indeed,linkedin,glassdoor): ');
          sources = customSources.split(',').map(s => s.trim().toLowerCase());
          break;
        default:
          console.log('Invalid choice. Using all sources.');
          sources = ['indeed', 'linkedin', 'glassdoor'];
      }
      
      await scraper.searchJobs(jobType, location, sources);
      scraper.displayJobs();
      
      const saveOption = await askQuestion('Save results to file? (y/n): ');
      if (saveOption.toLowerCase() === 'y') {
        const filename = await askQuestion('Enter filename (default: job_results.json): ') || 'job_results.json';
        scraper.saveJobsToFile(filename);
      }
    } else if (choice === '2') {
      console.log('Exiting job search. Goodbye!');
      rl.close();
      break;
    } else {
      console.log('Invalid choice. Please try again.');
    }
  }
}

// Run the job search application
runJobSearch();