import { createHash } from 'node:crypto';
import type { AppSnapshot, Job, ProviderStatus, SearchCriteria } from '../../shared/types';
import { adzunaProvider } from '../providers/adzuna';
import { arbeitnowProvider } from '../providers/arbeitnow';
import { devitjobsProvider } from '../providers/devitjobs';
import { joobleProvider } from '../providers/jooble';
import { linkedinProvider } from '../providers/linkedin';
import { reedProvider } from '../providers/reed';
import type { ProviderContext, ProviderDefinition } from '../providers/types';
import { AppStore, defaultProviderStatuses } from '../store';

declare const process: NodeJS.Process & { env: NodeJS.ProcessEnv & { ENABLE_LINKEDIN?: string } };

const linkedInIncluded = process.env.ENABLE_LINKEDIN === 'true';
const baseProviders = [reedProvider, adzunaProvider, arbeitnowProvider, devitjobsProvider, joobleProvider];
const providers = linkedInIncluded ? [...baseProviders, linkedinProvider] : baseProviders;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const lastRequestAt = new Map<string, number>();
const providerLastRun = new Map<string, string>();
const providerErrors = new Map<string, string>();
const MIN_PROVIDER_DELAY_MS = 1_000;

export class SearchService {
  private running = false;

  constructor(
    private readonly store: AppStore,
    private readonly publish: (snapshot: AppSnapshot, notify: boolean) => void,
  ) {}

  async search(criteria: SearchCriteria, notify = false): Promise<AppSnapshot> {
    if (this.running) return this.snapshot();
    this.running = true;
    try {
      const settings = this.store.currentSettings();
      const oldJobs = this.store.jobs();
      const existingKeys = new Set(oldJobs.map(jobKey));
      const statuses = new Map(this.getProviderStatuses().map((status) => [status.id, status]));
      const results = await Promise.all(providers.map(async (provider): Promise<Job[]> => {
        const status = statuses.get(provider.id);
        if (!settings.providerEnabled[provider.id]) return [];
        if (status?.state === 'needs-key' || status?.state === 'unavailable') return [];
        try {
          const jobs = await provider.search(criteria, this.context(provider));
          const completedAt = new Date().toISOString();
          providerLastRun.set(provider.id, completedAt);
          providerErrors.delete(provider.id);
          statuses.set(provider.id, {
            ...(status ?? this.providerStatus(provider.id)),
            state: 'ready',
            message: provider.experimental ? 'Experimental · public logged-out pages only · long cooldown' : 'Ready',
            lastRunAt: completedAt,
          });
          return jobs;
        } catch (error) {
          const message = safeErrorMessage(error);
          providerErrors.set(provider.id, message);
          const failedAt = new Date().toISOString();
          providerLastRun.set(provider.id, failedAt);
          statuses.set(provider.id, {
            ...(status ?? this.providerStatus(provider.id)),
            state: provider.id === 'linkedin' ? 'unavailable' : 'error',
            message,
            lastRunAt: failedAt,
          });
          return [];
        }
      }));

      const fetched = deduplicate(results.flat()).filter((job) => matchesCriteria(job, criteria));
      const newJobs = fetched.filter((job) => !existingKeys.has(jobKey(job)));
      const retained = oldJobs.map((job) => ({ ...job, isNew: false }));
      const allMerged = deduplicate([...fetched.map((job) => ({ ...job, isNew: !existingKeys.has(jobKey(job)) })), ...retained]);
      const trackedIds = new Set(this.store.tracker().map((entry) => entry.jobId));
      const trackedJobs = allMerged.filter((job) => trackedIds.has(job.id));
      const merged = [
        ...trackedJobs,
        ...allMerged.filter((job) => !trackedIds.has(job.id)).slice(0, Math.max(0, 3000 - trackedJobs.length)),
      ];
      await this.store.update({ jobs: merged, lastSearchAt: new Date().toISOString() });
      const snapshot = this.snapshot(
        newJobs.length,
        [...statuses.values()].map((status) => ({
          ...status,
          callsThisMonth: this.store.getUsage(status.id),
          lastRunAt: providerLastRun.get(status.id) ?? status.lastRunAt,
        })),
      );
      this.publish(snapshot, notify && settings.notifyOnNewJobs && newJobs.length > 0);
      return snapshot;
    } finally {
      this.running = false;
    }
  }

  snapshot(newJobsCount = 0, statuses = this.getProviderStatuses()): AppSnapshot {
    const dataJobs = this.store.jobs();
    const tracker = this.store.tracker();
    const trackedJobs = new Set(tracker.map((entry) => entry.jobId));
    return {
      jobs: dataJobs,
      savedSearches: this.store.savedSearches(),
      tracker: tracker.filter((entry) => trackedJobs.has(entry.jobId)),
      settings: this.store.currentSettings(),
      providerStatuses: statuses,
      lastSearchAt: this.store.lastSearchAt(),
      newJobsCount,
      linkedInIncluded,
      updateReady: false,
    };
  }

  getProviderStatuses(): ProviderStatus[] {
    const statuses = defaultProviderStatuses(
      this.store.currentSettings().providerEnabled,
      (id) => this.store.hasApiKey(id),
      (id) => this.store.getUsage(id),
      linkedInIncluded,
    );
    return statuses.map((status) => ({
      ...status,
      lastRunAt: providerLastRun.get(status.id) ?? null,
      ...(providerErrors.has(status.id) && status.state !== 'disabled'
        ? {
            state: status.id === 'linkedin' ? 'unavailable' as const : 'error' as const,
            message: providerErrors.get(status.id)!,
          }
        : {}),
    }));
  }

  private providerStatus(id: string): ProviderStatus {
    return this.getProviderStatuses().find((status) => status.id === id)!;
  }

  private context(provider: ProviderDefinition): ProviderContext {
    return {
      apiKey: this.store.getApiKey(provider.id),
      requestJson: async <T>(providerId: string, url: string, init: RequestInit = {}, cacheMs = 10 * 60_000) => {
        const key = `${providerId}:${url}`;
        const cached = cache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.value as T;
        await throttle(providerId);
        await this.store.incrementUsage(providerId);
        const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(responseError(providerId, response.status));
        const value: unknown = await response.json();
        if (cacheMs > 0) cache.set(key, { expiresAt: Date.now() + cacheMs, value });
        return value as T;
      },
      requestText: async (providerId: string, url: string, init: RequestInit = {}, cacheMs = 10 * 60_000) => {
        const key = `${providerId}:${url}`;
        const cached = cache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.value as string;
        await throttle(providerId);
        await this.store.incrementUsage(providerId);
        const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(responseError(providerId, response.status));
        const value = await response.text();
        if (cacheMs > 0) cache.set(key, { expiresAt: Date.now() + cacheMs, value });
        return value;
      },
    };
  }
}

async function throttle(providerId: string): Promise<void> {
  const wait = MIN_PROVIDER_DELAY_MS - (Date.now() - (lastRequestAt.get(providerId) ?? 0));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt.set(providerId, Date.now());
}

function responseError(providerId: string, status: number): string {
  if (status === 401 || status === 403) return `${providerId} rejected the request. Check the API key or provider access.`;
  if (status === 429) return `${providerId} rate limit reached. Try again later.`;
  return `${providerId} request failed with HTTP ${status}.`;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Provider request failed.';
  return message.replace(/(app_key=)[^&\s]+/gi, '$1[redacted]').slice(0, 240);
}

function jobKey(job: Job): string {
  return `${job.title}|${job.company}|${job.location}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function deduplicate(jobs: Job[]): Job[] {
  const known = new Set<string>();
  return jobs.flatMap((job) => {
    const key = jobKey(job);
    if (known.has(key)) return [];
    known.add(key);
    const id = `job:${createHash('sha256').update(key).digest('hex')}`;
    return [{ ...job, id }];
  });
}

function matchesCriteria(job: Job, criteria: SearchCriteria): boolean {
  if (criteria.remote && !job.remote) return false;
  if (criteria.minimumSalary && job.salaryMax !== null && job.salaryMax < criteria.minimumSalary) return false;
  if (criteria.contractType !== 'any' && job.contractType && job.contractType !== criteria.contractType) return false;
  if (criteria.postedWithinDays > 0 && job.postedAt) {
    const cutoff = Date.now() - criteria.postedWithinDays * 24 * 60 * 60_000;
    if (new Date(job.postedAt).getTime() < cutoff) return false;
  }
  return true;
}
