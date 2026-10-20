import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AppSettings,
  Job,
  ProviderStatus,
  SearchCriteria,
  TrackerEntry,
} from '../shared/types';

interface UsageRecord {
  month: string;
  calls: number;
}

export interface PersistedData {
  settings: AppSettings;
  savedSearches: SearchCriteria[];
  jobs: Job[];
  tracker: TrackerEntry[];
  secrets: Record<string, string>;
  usage: Record<string, UsageRecord>;
  lastSearchAt: string | null;
}

const defaultSettings: AppSettings = {
  providerEnabled: {
    reed: true,
    adzuna: true,
    jooble: false,
    arbeitnow: true,
    devitjobs: true,
    linkedin: false,
  },
  refreshIntervalMinutes: 60,
  notifyOnNewJobs: true,
  closeToTray: true,
  launchAtLogin: false,
  startMinimised: false,
  theme: 'system',
  linkedinAcknowledged: false,
};

const defaultSearch: SearchCriteria = {
  id: 'default-bristol-tech',
  name: 'Software roles in Bristol',
  keywords: 'software developer',
  location: 'Bristol',
  radiusMiles: 25,
  minimumSalary: null,
  contractType: 'any',
  remote: false,
  postedWithinDays: 30,
  unfilteredLocationMode: 'matches-location',
};

export class AppStore {
  private readonly filePath = join(app.getPath('userData'), 'job-search-data.json');
  private data: PersistedData = {
    settings: defaultSettings,
    savedSearches: [defaultSearch],
    jobs: [],
    tracker: [],
    secrets: {},
    usage: {},
    lastSearchAt: null,
  };

  async load(): Promise<void> {
    await mkdir(app.getPath('userData'), { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!isPersistedData(parsed)) throw new Error('Stored app data has an invalid structure.');
      this.data = {
        ...parsed,
        settings: { ...defaultSettings, ...parsed.settings },
        savedSearches: parsed.savedSearches.length
          ? parsed.savedSearches.map((search) => ({
              ...search,
              unfilteredLocationMode: search.unfilteredLocationMode ?? 'matches-location',
            }))
          : [defaultSearch],
      };
    } catch (error) {
      if (isMissingFile(error)) {
        await this.persist();
        return;
      }
      throw new Error(`Could not load saved app data: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  snapshotData(): PersistedData {
    return structuredClone(this.data);
  }

  async update(update: Partial<PersistedData>): Promise<void> {
    this.data = { ...this.data, ...update };
    await this.persist();
  }

  async setApiKey(providerId: string, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Windows secure storage is unavailable. The API key was not saved.');
    }
    this.data.secrets[providerId] = safeStorage.encryptString(value).toString('base64');
    await this.persist();
  }

  getApiKey(providerId: string): string | null {
    const stored = this.data.secrets[providerId];
    if (!stored) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      throw new Error(`The saved ${providerId} API key could not be decrypted. Enter it again in Settings.`);
    }
  }

  hasApiKey(providerId: string): boolean {
    return Boolean(this.data.secrets[providerId]);
  }

  getUsage(providerId: string): number {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usage = this.data.usage[providerId];
    return usage?.month === currentMonth ? usage.calls : 0;
  }

  async incrementUsage(providerId: string): Promise<void> {
    const month = new Date().toISOString().slice(0, 7);
    const previous = this.data.usage[providerId];
    this.data.usage[providerId] = {
      month,
      calls: previous?.month === month ? previous.calls + 1 : 1,
    };
    await this.persist();
  }

  async addTracker(entry: TrackerEntry): Promise<void> {
    const tracker = this.data.tracker.filter((current) => current.jobId !== entry.jobId);
    tracker.push(entry);
    await this.update({ tracker });
  }

  currentSettings(): AppSettings {
    return structuredClone(this.data.settings);
  }

  jobs(): Job[] {
    return structuredClone(this.data.jobs);
  }

  savedSearches(): SearchCriteria[] {
    return structuredClone(this.data.savedSearches);
  }

  tracker(): TrackerEntry[] {
    return structuredClone(this.data.tracker);
  }

  lastSearchAt(): string | null {
    return this.data.lastSearchAt;
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(this.data), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}

export function defaultProviderStatuses(
  enabled: Record<string, boolean>,
  keyAvailable: (id: string) => boolean,
  usage: (id: string) => number,
  linkedInIncluded: boolean,
): ProviderStatus[] {
  const definitions = [
    { id: 'reed', name: 'Reed', requiresKey: true, experimental: false, docsUrl: 'https://www.reed.co.uk/developers/Jobseeker', keyUrl: 'https://www.reed.co.uk/developers/Jobseeker#API-key' },
    { id: 'adzuna', name: 'Adzuna', requiresKey: true, experimental: false, docsUrl: 'https://developer.adzuna.com/docs/search', keyUrl: 'https://developer.adzuna.com/signup' },
    { id: 'jooble', name: 'Jooble', requiresKey: true, experimental: false, docsUrl: 'https://jooble.org/api/about', keyUrl: 'https://jooble.org/api/about' },
    { id: 'arbeitnow', name: 'Arbeitnow', requiresKey: false, experimental: false, docsUrl: 'https://www.arbeitnow.com/api/job-board-api', keyUrl: null },
    { id: 'devitjobs', name: 'DevITjobs UK', requiresKey: false, experimental: false, docsUrl: 'https://devitjobs.uk/rss', keyUrl: null },
    { id: 'linkedin', name: 'LinkedIn', requiresKey: false, experimental: true, docsUrl: 'https://www.linkedin.com/legal/user-agreement', keyUrl: null },
  ];
  return definitions.map((definition) => {
    const active = enabled[definition.id] ?? false;
    let state: ProviderStatus['state'] = active ? 'ready' : 'disabled';
    let message = active ? 'Ready' : 'Disabled';
    if (definition.id === 'jooble' && active) {
      state = 'unavailable';
      message = 'Integration paused: official API documentation could not be accessed to verify request details.';
    } else if (definition.id === 'linkedin' && !linkedInIncluded) {
      state = 'unavailable';
      message = 'Not included in this build. Set ENABLE_LINKEDIN=true to include the experimental provider.';
    } else if (active && definition.requiresKey && !keyAvailable(definition.id)) {
      state = 'needs-key';
      message = 'Add your API key';
    } else if (active && definition.id === 'linkedin') {
      message = 'Experimental · public logged-out pages only · long cooldown';
    }
    return {
      ...definition,
      state,
      message,
      callsThisMonth: usage(definition.id),
      lastRunAt: null,
    };
  });
}

function isPersistedData(value: unknown): value is PersistedData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Partial<PersistedData>;
  return Boolean(
    data.settings && Array.isArray(data.savedSearches) && Array.isArray(data.jobs) &&
    Array.isArray(data.tracker) && data.secrets && data.usage,
  );
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
