import type { Job } from '../../shared/types';
import { createJob } from './normalize';
import type { ProviderDefinition } from './types';

interface ReedJob {
  jobId?: number;
  jobTitle?: string;
  employerName?: string;
  locationName?: string;
  minimumSalary?: number;
  maximumSalary?: number;
  salaryType?: string;
  contractType?: string;
  jobType?: string;
  jobDescription?: string;
  date?: string;
  expirationDate?: string;
  jobUrl?: string;
  url?: string;
}

export const reedProvider: ProviderDefinition = {
  id: 'reed',
  name: 'Reed',
  requiresKey: true,
  experimental: false,
  docsUrl: 'https://www.reed.co.uk/developers/Jobseeker',
  keyUrl: 'https://www.reed.co.uk/developers/Jobseeker#API-key',
  async search(criteria, context): Promise<Job[]> {
    if (!context.apiKey) throw new Error('Add your Reed API key in Settings.');
    const url = new URL('https://www.reed.co.uk/api/1.0/search');
    url.searchParams.set('keywords', criteria.keywords);
    url.searchParams.set('locationName', criteria.location);
    url.searchParams.set('distanceFromLocation', String(criteria.radiusMiles));
    url.searchParams.set('resultsToTake', '100');
    if (criteria.minimumSalary) url.searchParams.set('minimumSalary', String(criteria.minimumSalary));
    if (criteria.contractType === 'permanent') url.searchParams.set('permanent', 'true');
    if (criteria.contractType === 'contract') url.searchParams.set('contract', 'true');
    if (criteria.contractType === 'part-time') url.searchParams.set('partTime', 'true');

    const authorization = Buffer.from(`${context.apiKey}:`).toString('base64');
    const result = await context.requestJson<unknown>('reed', url.toString(), {
      headers: { Authorization: `Basic ${authorization}`, Accept: 'application/json' },
    });
    if (!Array.isArray(result)) throw new Error('Reed returned an unexpected response.');

    return result.flatMap((value): Job[] => {
      const job = value as ReedJob;
      const id = String(job.jobId ?? '');
      if (!id) return [];
      const listingUrl = `https://www.reed.co.uk/jobs/${encodeURIComponent(id)}`;
      const normalized = createJob({
        id: `reed:${id}`,
        title: job.jobTitle,
        company: job.employerName,
        location: job.locationName,
        salaryMin: job.minimumSalary,
        salaryMax: job.maximumSalary,
        salaryPeriod: job.salaryType,
        contractType: job.contractType ?? job.jobType,
        description: job.jobDescription,
        postedAt: job.date ?? job.expirationDate,
        url: job.jobUrl ?? job.url,
        fallbackUrl: listingUrl,
        source: { id: 'reed', name: 'Reed', url: 'https://www.reed.co.uk' },
        query: criteria.keywords,
      });
      return normalized ? [normalized] : [];
    });
  },
};
