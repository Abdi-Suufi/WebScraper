import type { Job, SearchCriteria } from './types';

const ukLocation = /\b(?:uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|bristol|bath|london|manchester|birmingham|leeds|liverpool|glasgow|edinburgh|cardiff|newcastle|nottingham|sheffield|oxford|cambridge|brighton|farnborough|reading|southampton|portsmouth|exeter|plymouth|york|derby|leicester|coventry|aberdeen|dundee|swansea|belfast|norwich|ipswich|milton keynes|luton|chelmsford|chester|preston|stoke|worcester|gloucester|hereford|canterbury|winchester|wakefield|huddersfield|blackpool|swindon|taunton|crawley|guildford|slough)\b/i;
const ukPostcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

export function isUkLocation(value: string): boolean {
  return ukLocation.test(value) || ukPostcode.test(value);
}

export function matchesUnfilteredLocation(job: Job, criteria: SearchCriteria): boolean {
  if (job.source.id !== 'arbeitnow' && job.source.id !== 'devitjobs') return true;
  if (!isUkLocation(job.location) && job.source.id !== 'devitjobs') return false;
  if (criteria.unfilteredLocationMode === 'anywhere-uk') return true;
  if (criteria.unfilteredLocationMode === 'remote-uk') {
    return job.remote && (job.source.id === 'devitjobs' || isUkLocation(job.location));
  }
  const requested = normalize(criteria.location);
  const actual = normalize(job.location);
  if (!requested || !actual || actual === 'united kingdom') return false;
  return actual.includes(requested) || requested.includes(actual);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
