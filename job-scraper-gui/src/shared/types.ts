export type ContractType = 'permanent' | 'contract' | 'part-time';
export type SalaryPeriod = 'hour' | 'day' | 'week' | 'month' | 'year';
export type TrackerStatus = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';
export type ThemeMode = 'system' | 'light' | 'dark';
export type Page = 'jobs' | 'searches' | 'tracker' | 'settings';
export type UnfilteredLocationMode = 'matches-location' | 'remote-uk' | 'anywhere-uk';

export interface JobSource {
  id: string;
  name: string;
  url: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  contractType: ContractType | null;
  remote: boolean;
  description: string;
  postedAt: string | null;
  url: string;
  source: JobSource;
  isNew: boolean;
  relevance: number;
}

export interface SearchCriteria {
  id: string;
  name: string;
  keywords: string;
  location: string;
  radiusMiles: number;
  minimumSalary: number | null;
  contractType: ContractType | 'any';
  remote: boolean;
  postedWithinDays: number;
  unfilteredLocationMode: UnfilteredLocationMode;
}

export interface TrackerEntry {
  jobId: string;
  status: TrackerStatus;
  notes: string;
  updatedAt: string;
}

export interface AppSettings {
  providerEnabled: Record<string, boolean>;
  refreshIntervalMinutes: number;
  notifyOnNewJobs: boolean;
  closeToTray: boolean;
  launchAtLogin: boolean;
  startMinimised: boolean;
  theme: ThemeMode;
  linkedinAcknowledged: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  state: 'ready' | 'needs-key' | 'disabled' | 'error' | 'unavailable';
  message: string;
  callsThisMonth: number;
  lastRunAt: string | null;
  experimental: boolean;
  requiresKey: boolean;
  docsUrl: string;
  keyUrl: string | null;
}

export interface AppSnapshot {
  jobs: Job[];
  savedSearches: SearchCriteria[];
  tracker: TrackerEntry[];
  settings: AppSettings;
  providerStatuses: ProviderStatus[];
  lastSearchAt: string | null;
  newJobsCount: number;
  linkedInIncluded: boolean;
  updateReady: boolean;
}

export interface JobAppApi {
  getSnapshot(): Promise<AppSnapshot>;
  search(criteria: SearchCriteria): Promise<AppSnapshot>;
  saveSearch(criteria: SearchCriteria): Promise<AppSnapshot>;
  deleteSearch(id: string): Promise<AppSnapshot>;
  updateSettings(settings: AppSettings): Promise<AppSnapshot>;
  saveApiKey(providerId: string, key: string): Promise<AppSnapshot>;
  getProviderStatuses(): Promise<ProviderStatus[]>;
  updateTracker(entry: TrackerEntry): Promise<AppSnapshot>;
  openExternal(url: string): Promise<void>;
  exportJobs(format: 'csv' | 'json'): Promise<boolean>;
  onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
  onUpdateReady(callback: () => void): () => void;
  installUpdate(): void;
}
