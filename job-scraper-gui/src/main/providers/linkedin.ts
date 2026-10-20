import { load } from 'cheerio';
import type { Job } from '../../shared/types';
import { createJob } from './normalize';
import type { ProviderDefinition } from './types';

const PAGE_DELAY_MS = 15_000;
const MIN_REFRESH_MS = 6 * 60 * 60_000;
let lastRefreshAt = 0;
let unavailableUntil = 0;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const linkedinProvider: ProviderDefinition = {
  id: 'linkedin',
  name: 'LinkedIn (Experimental)',
  requiresKey: false,
  experimental: true,
  docsUrl: 'https://www.linkedin.com/legal/user-agreement',
  keyUrl: null,
  async search(criteria, context): Promise<Job[]> {
    if (Date.now() < unavailableUntil) {
      throw new Error('LinkedIn is unavailable after a recent block or unexpected response. Try again later.');
    }
    if (Date.now() - lastRefreshAt < MIN_REFRESH_MS) {
      throw new Error('LinkedIn is cooling down. Try again after the six-hour refresh interval.');
    }
    lastRefreshAt = Date.now();
    const jobs: Job[] = [];

    for (let page = 0; page < 2; page += 1) {
      if (page > 0) await delay(PAGE_DELAY_MS);
      const url = new URL('https://www.linkedin.com/jobs/search/');
      url.searchParams.set('keywords', criteria.keywords);
      url.searchParams.set('location', `${criteria.location}, United Kingdom`);
      url.searchParams.set('start', String(page * 25));
      let html: string;
      try {
        html = await context.requestText('linkedin', url.toString(), {
          headers: { Accept: 'text/html' },
        }, 0);
      } catch {
        unavailableUntil = Date.now() + 24 * 60 * 60_000;
        throw new Error('LinkedIn is unavailable after a failed public-page request. This source is paused for 24 hours.');
      }
      const $ = load(html);
      const pageText = $('body').text().toLowerCase();
      if (
        /captcha|security verification|sign in to linkedin|join linkedin|authwall|checkpoint/.test(pageText)
      ) {
        unavailableUntil = Date.now() + 24 * 60 * 60_000;
        throw new Error('LinkedIn returned a login wall or block. This source is unavailable for 24 hours.');
      }

      const cards = $('.base-search-card').toArray();
      if (cards.length === 0) {
        unavailableUntil = Date.now() + 24 * 60 * 60_000;
        throw new Error('LinkedIn returned unexpected public search content. This source is unavailable for 24 hours.');
      }
      for (const card of cards) {
        const node = $(card);
        const link = node.find('a.base-card__full-link').attr('href');
        const title = node.find('.base-search-card__title').text();
        const company = node.find('.base-search-card__subtitle').text();
        const location = node.find('.job-search-card__location').text();
        if (!link || !title.trim()) continue;
        const normalized = createJob({
          id: `linkedin:${link.split('?')[0]}`,
          title,
          company,
          location,
          postedAt: node.find('time').attr('datetime'),
          url: link,
          fallbackUrl: 'https://www.linkedin.com/jobs/search/',
          source: { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com' },
          query: criteria.keywords,
        });
        if (normalized) jobs.push(normalized);
      }
    }
    return jobs;
  },
};
