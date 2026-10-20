import type { Job } from '../../shared/types';
import { createJob } from './normalize';
import type { ProviderDefinition } from './types';

interface AdzunaJob {
  id?: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  contract_time?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

export const adzunaProvider: ProviderDefinition = {
  id: 'adzuna',
  name: 'Adzuna',
  requiresKey: true,
  experimental: false,
  docsUrl: 'https://developer.adzuna.com/docs/search',
  keyUrl: 'https://developer.adzuna.com/signup',
  async search(criteria, context): Promise<Job[]> {
    const [appId, appKey] = (context.apiKey ?? '').split('\n');
    if (!appId || !appKey) throw new Error('Add your Adzuna app ID and app key in Settings.');
    const url = new URL('https://api.adzuna.com/v1/api/jobs/gb/search/1');
    url.searchParams.set('app_id', appId);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('results_per_page', '20');
    url.searchParams.set('what', criteria.keywords);
    url.searchParams.set('where', criteria.location);
    url.searchParams.set('distance', String(criteria.radiusMiles));
    url.searchParams.set('content-type', 'application/json');
    if (criteria.minimumSalary) url.searchParams.set('salary_min', String(criteria.minimumSalary));
    if (criteria.contractType === 'permanent') url.searchParams.set('permanent', '1');
    if (criteria.contractType === 'contract') url.searchParams.set('contract', '1');
    if (criteria.contractType === 'part-time') url.searchParams.set('full_time', '0');

    const response = await context.requestJson<AdzunaResponse>('adzuna', url.toString());
    if (!Array.isArray(response.results)) throw new Error('Adzuna returned an unexpected response.');
    return response.results.flatMap((job): Job[] => {
      const id = String(job.id ?? '');
      if (!id) return [];
      const normalized = createJob({
        id: `adzuna:${id}`,
        title: job.title,
        company: job.company?.display_name,
        location: job.location?.display_name,
        salaryMin: job.salary_min,
        salaryMax: job.salary_max,
        salaryPeriod: job.salary_min || job.salary_max ? 'year' : null,
        contractType: job.contract_type ?? job.contract_time,
        description: job.description,
        postedAt: job.created,
        url: job.redirect_url,
        fallbackUrl: `https://www.adzuna.co.uk/details/${encodeURIComponent(id)}`,
        source: { id: 'adzuna', name: 'Adzuna', url: 'https://www.adzuna.co.uk' },
        query: criteria.keywords,
      });
      return normalized ? [normalized] : [];
    });
  },
};
