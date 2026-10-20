import type { JobAppApi } from '../shared/types';

declare global {
  interface Window {
    jobApp: JobAppApi;
  }
}

export {};
