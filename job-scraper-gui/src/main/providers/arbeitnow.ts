import type { Job } from '../../shared/types';
import { isUkLocation } from '../../shared/location';
import { createJob } from './normalize';
import type { ProviderDefinition } from './types';

interface ArbeitnowJob {
  slug?: string;
  title?: string;
  company_name?: string;
  description?: string;
  location?: string;
  remote?: boolean;
  url?: string;
  created_at?: number;
  job_types?: string[];
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
}

export const arbeitnowProvider: ProviderDefinition = {
  id: 'arbeitnow',
  name: 'Arbeitnow',
  requiresKey: false,
  experimental: false,
  docsUrl: 'https://www.arbeitnow.com/api/job-board-api',
  keyUrl: null,
  async search(criteria, context): Promise<Job[]> {
    const response = await context.requestJson<ArbeitnowResponse>(
      'arbeitnow',
      'https://www.arbeitnow.com/api/job-board-api',
      {},
      15 * 60_000,
    );
    if (!Array.isArray(response.data)) throw new Error('Arbeitnow returned an unexpected response.');
    const terms = criteria.keywords.toLowerCase().split(/\s+/).filter(Boolean);
    return response.data.flatMap((job): Job[] => {
      const location = job.location ?? '';
      const searchable = `${job.title ?? ''} ${job.description ?? ''}`.toLowerCase();
      if (!isUkLocation(location) || (terms.length && !terms.some((term) => searchable.includes(term)))) return [];
      const id = job.slug ?? job.url ?? '';
      if (!id) return [];
      const normalized = createJob({
        id: `arbeitnow:${id}`,
        title: job.title,
        company: job.company_name,
        location,
        remote: job.remote,
        contractType: job.job_types?.join(' '),
        description: job.description,
        postedAt: job.created_at,
        url: job.url,
        fallbackUrl: `https://www.arbeitnow.com/jobs/${encodeURIComponent(job.slug ?? id)}`,
        source: { id: 'arbeitnow', name: 'Arbeitnow', url: 'https://www.arbeitnow.com' },
        query: criteria.keywords,
      });
      return normalized ? [normalized] : [];
    });
  },
};
