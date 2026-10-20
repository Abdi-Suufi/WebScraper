import { load } from 'cheerio';
import type {
  ContractType,
  Job,
  JobSource,
  SalaryPeriod,
} from '../../shared/types';

export function safeJobUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeContract(value: unknown): ContractType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  if (normalized.includes('part')) return 'part-time';
  if (normalized.includes('contract') || normalized.includes('temporary') || normalized === 'temp') return 'contract';
  if (normalized.includes('permanent') || normalized.includes('full')) return 'permanent';
  return null;
}

export function normalizeSalaryPeriod(value: unknown): SalaryPeriod | null {
  if (typeof value !== 'string') return null;
  const period = value.toLowerCase();
  if (period.includes('hour')) return 'hour';
  if (period.includes('day')) return 'day';
  if (period.includes('week')) return 'week';
  if (period.includes('month')) return 'month';
  if (period.includes('year') || period.includes('annum') || period.includes('annual')) return 'year';
  return null;
}

export function createJob(input: {
  id: string;
  title: unknown;
  company: unknown;
  location: unknown;
  salaryMin?: unknown;
  salaryMax?: unknown;
  salaryPeriod?: unknown;
  contractType?: unknown;
  remote?: unknown;
  description?: unknown;
  postedAt?: unknown;
  url: unknown;
  fallbackUrl: string;
  source: JobSource;
  query: string;
}): Job | null {
  const title = text(input.title);
  if (!title) return null;
  const company = text(input.company) || 'Company not listed';
  const location = text(input.location) || 'Location not listed';
  const description = cleanDescription(input.description);
  const searchTerms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${title} ${company} ${location} ${description}`.toLowerCase();
  const relevance = searchTerms.length
    ? searchTerms.filter((term) => haystack.includes(term)).length / searchTerms.length
    : 0;

  return {
    id: input.id,
    title,
    company,
    location,
    salaryMin: numberOrNull(input.salaryMin),
    salaryMax: numberOrNull(input.salaryMax),
    salaryPeriod: normalizeSalaryPeriod(input.salaryPeriod),
    contractType: normalizeContract(input.contractType),
    remote: input.remote === true || /remote|work from home|wfh/i.test(`${location} ${description}`),
    description,
    postedAt: dateOrNull(input.postedAt),
    url: safeJobUrl(input.url, input.fallbackUrl),
    source: input.source,
    isNew: false,
    relevance,
  };
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export function cleanDescription(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  let markup = value;

  for (let pass = 0; pass < 4; pass += 1) {
    const $ = load(markup);
    const body = $('body');
    body.find('script, style, iframe, object, embed, svg, math, template, noscript, head').remove();
    const content = body;
    const plain = content.text().trim();
    if (hasMarkup(plain)) {
      markup = plain;
      continue;
    }

    content.find('li p').each((_index, element) => {
      const paragraph = $(element);
      paragraph.before(paragraph.contents());
      paragraph.remove();
    });
    content.find('br').replaceWith('\n');
    content.find('li').each((_index, element) => {
      $(element).prepend('\n• ').append('\n');
    });
    content.find('p, div, section, article, h1, h2, h3, h4, blockquote, ul, ol').each((_index, element) => {
      $(element).prepend('\n').append('\n');
    });

    let output = decodeEntities(content.text());
    if (hasMarkup(output)) {
      markup = output;
      continue;
    }
    output = output
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    return output;
  }

  const $ = load(markup);
  $('script, style, iframe, object, embed, svg, math, template, noscript, head').remove();
  return decodeEntities($('body').text())
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  let decodedValue = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const nextValue = decodedValue.replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, (entity) => {
      const decoded = load(`<body>${entity}</body>`)('body').text();
      return decoded === entity ? entity : decoded;
    });
    if (nextValue === decodedValue) break;
    decodedValue = nextValue;
  }
  return decodedValue;
}

function hasMarkup(value: string): boolean {
  return /<\/?(?:p|br|ul|ol|li|strong|b|em|i|a|h[1-4]|div|section|article|span|script|style)\b[^>]*>/i.test(value);
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dateOrNull(value: unknown): string | null {
  if (typeof value === 'number') {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
