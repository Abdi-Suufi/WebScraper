import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSnapshot,
  AppSettings,
  JobAppApi,
  ProviderStatus,
  SearchCriteria,
  TrackerEntry,
} from '../shared/types';

const api: JobAppApi = {
  getSnapshot: () => ipcRenderer.invoke('app:snapshot') as Promise<AppSnapshot>,
  search: (criteria: SearchCriteria) => ipcRenderer.invoke('jobs:search', criteria) as Promise<AppSnapshot>,
  saveSearch: (criteria: SearchCriteria) => ipcRenderer.invoke('searches:save', criteria) as Promise<AppSnapshot>,
  deleteSearch: (id: string) => ipcRenderer.invoke('searches:delete', id) as Promise<AppSnapshot>,
  updateSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:update', settings) as Promise<AppSnapshot>,
  saveApiKey: (providerId: string, key: string) =>
    ipcRenderer.invoke('keys:save', providerId, key) as Promise<AppSnapshot>,
  getProviderStatuses: () => ipcRenderer.invoke('providers:statuses') as Promise<ProviderStatus[]>,
  updateTracker: (entry: TrackerEntry) => ipcRenderer.invoke('tracker:update', entry) as Promise<AppSnapshot>,
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url) as Promise<void>,
  exportJobs: (format: 'csv' | 'json') => ipcRenderer.invoke('jobs:export', format) as Promise<boolean>,
  onSnapshot(callback) {
    const listener = (_event: Electron.IpcRendererEvent, value: AppSnapshot): void => callback(value);
    ipcRenderer.on('app:snapshot-updated', listener);
    return () => ipcRenderer.removeListener('app:snapshot-updated', listener);
  },
  onUpdateReady(callback) {
    const listener = (): void => callback();
    ipcRenderer.on('app:update-ready', listener);
    return () => ipcRenderer.removeListener('app:update-ready', listener);
  },
  installUpdate: () => ipcRenderer.send('app:install-update'),
};

contextBridge.exposeInMainWorld('jobApp', api);
