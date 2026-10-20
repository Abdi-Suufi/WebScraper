import type { Job, ProviderStatus, SearchCriteria } from '../../shared/types';

export interface ProviderDefinition {
  id: string;
  name: string;
  requiresKey: boolean;
  experimental: boolean;
  docsUrl: string;
  keyUrl: string | null;
  search(criteria: SearchCriteria, context: ProviderContext): Promise<Job[]>;
}

export interface ProviderContext {
  apiKey: string | null;
  requestJson<T>(providerId: string, url: string, init?: RequestInit, cacheMs?: number): Promise<T>;
  requestText(providerId: string, url: string, init?: RequestInit, cacheMs?: number): Promise<string>;
}

export interface ProviderRegistryEntry {
  provider: ProviderDefinition;
  status: ProviderStatus;
}
