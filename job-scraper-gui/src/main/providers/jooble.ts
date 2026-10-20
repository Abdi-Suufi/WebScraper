import type { Job } from '../../shared/types';
import type { ProviderDefinition } from './types';

export const joobleProvider: ProviderDefinition = {
  id: 'jooble',
  name: 'Jooble',
  requiresKey: true,
  experimental: false,
  docsUrl: 'https://jooble.org/api/about',
  keyUrl: 'https://jooble.org/api/about',
  async search(): Promise<Job[]> {
    throw new Error('Jooble is paused until its official API request documentation can be verified.');
  },
};
