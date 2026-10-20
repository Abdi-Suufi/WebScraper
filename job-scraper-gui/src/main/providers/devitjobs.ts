import { load } from 'cheerio';
import type { Job } from '../../shared/types';
import { cleanDescription, createJob } from './normalize';
import type { ProviderDefinition } from './types';

export const devitjobsProvider: ProviderDefinition = {
  id: 'devitjobs',
  name: 'DevITjobs UK',
  requiresKey: false,
  experimental: false,
  docsUrl: 'https://devitjobs.uk/rss',
  keyUrl: null,
  async search(criteria, context): Promise<Job[]> {
    const xml = await context.requestText('devitjobs', 'https://devitjobs.uk/rss', {}, 30 * 60_000);
    const $ = load(xml, { xmlMode: true });
    const terms = criteria.keywords.toLowerCase().split(/\s+/).filter(Boolean);
    return $('item').toArray().flatMap((item): Job[] => {
      const node = $(item);
      const title = node.find('title').text().trim();
      const description = node.find('description').text().trim();
      const cleanText = cleanDescription(description);
      const combined = `${title} ${cleanText}`.toLowerCase();
      if (terms.length && !terms.some((term) => combined.includes(term))) return [];
      const link = node.find('link').text().trim();
      if (!link) return [];
      const titleParts = title.match(/^(.*?)\s*@\s*(.*?)\s*\[(.*?)\]\s*$/);
      const salaryText = titleParts?.[3] ?? '';
      const salaryValues = [...salaryText.matchAll(/£\s*([\d,]+)/g)].map((match) => Number(match[1].replace(/,/g, '')));
      const location = extractLocation(cleanText);
      const normalized = createJob({
        id: `devitjobs:${link}`,
        title: titleParts?.[1] ?? title,
        company: titleParts?.[2] ?? 'Company not listed',
        location,
        salaryMin: salaryValues[0],
        salaryMax: salaryValues[1] ?? salaryValues[0],
        salaryPeriod: 'year',
        description,
        postedAt: node.find('pubDate').text(),
        url: link,
        fallbackUrl: 'https://devitjobs.uk/',
        source: { id: 'devitjobs', name: 'DevITjobs UK', url: 'https://devitjobs.uk' },
        query: criteria.keywords,
      });
      return normalized ? [normalized] : [];
    });
  },
};

function extractLocation(description: string): string {
  const locationPattern =
    /(?:based in|located in|office(?:s)? in|commute reliably to|working in|work in)\s+(?:the\s+)?([A-Z][A-Za-z.'’/-]*(?:\s+[A-Z][A-Za-z.'’/-]*){0,3}(?:,\s*[A-Z][A-Za-z.'’/-]*(?:\s+[A-Z][A-Za-z.'’/-]*){0,2})?)/g;
  const match = locationPattern.exec(description);
  return match?.[1]?.replace(/\s+(?:area|region)$/i, '').trim() || 'United Kingdom';
}
