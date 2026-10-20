import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  shell,
  Tray,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import type {
  AppSettings,
  AppSnapshot,
  Job,
  SearchCriteria,
  TrackerEntry,
} from '../shared/types';
import { SearchService } from './services/search';
import { AppStore } from './store';

const contractSchema = z.enum(['permanent', 'contract', 'part-time', 'any']);
const criteriaSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  keywords: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(100),
  radiusMiles: z.number().int().min(1).max(100),
  minimumSalary: z.number().int().min(0).max(1_000_000).nullable(),
  contractType: contractSchema,
  remote: z.boolean(),
  postedWithinDays: z.number().int().min(1).max(365),
  unfilteredLocationMode: z.enum(['matches-location', 'remote-uk', 'anywhere-uk']),
});
const settingsSchema = z.object({
  providerEnabled: z.record(z.string(), z.boolean()),
  refreshIntervalMinutes: z.number().int().min(15).max(1440),
  notifyOnNewJobs: z.boolean(),
  closeToTray: z.boolean(),
  launchAtLogin: z.boolean(),
  startMinimised: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  linkedinAcknowledged: z.boolean(),
});
const trackerSchema = z.object({
  jobId: z.string().min(1).max(500),
  status: z.enum(['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected']),
  notes: z.string().max(5000),
  updatedAt: z.string().datetime(),
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let refreshTimer: NodeJS.Timeout | undefined;
let store: AppStore;
let searchService: SearchService;

app.setAppUserModelId('uk.co.abdis.jobsearch');

function isTrustedSender(frameUrl: string): boolean {
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  if (devUrl) {
    try {
      return new URL(frameUrl).origin === new URL(devUrl).origin;
    } catch {
      return false;
    }
  }
  try {
    return fileURLToPath(frameUrl) === fileURLToPath(pathToFileURL(join(__dirname, '../renderer/index.html')));
  } catch {
    return false;
  }
}

function requireTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isTrustedSender(event.senderFrame?.url ?? '')) throw new Error('Untrusted application frame.');
}

function isDevelopment(): boolean {
  return !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);
}

function contentSecurityPolicy(): string {
  const common = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
  if (isDevelopment()) {
    return `${common}; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http://localhost:5173 ws://localhost:5173`;
  }
  return `${common}; script-src 'self'; connect-src 'self'`;
}

function titleBarColors(): { color: string; symbolColor: string } {
  const dark = store.currentSettings().theme === 'dark' ||
    (store.currentSettings().theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark
    ? { color: '#1c202b', symbolColor: '#e8ebf2' }
    : { color: '#ffffff', symbolColor: '#242936' };
}

function createWindow(): void {
  const titleColors = titleBarColors();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: titleColors.color,
    icon: join(__dirname, '../../icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      ...titleColors,
      height: 42,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!isDevelopment()) return;
    const devToolsShortcut =
      input.key === 'F12' ||
      (input.key.toLowerCase() === 'i' && input.control && input.shift);
    if (devToolsShortcut) {
      event.preventDefault();
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
  mainWindow.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      console.error(
        `[renderer error] ${details.message} (${details.sourceId}:${details.lineNumber})`,
      );
    }
  });
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(
        `[renderer load failure] code=${errorCode} mainFrame=${isMainFrame} url=${validatedURL}: ${errorDescription}`,
      );
    },
  );
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      `[renderer process gone] reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedSender(targetUrl)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => {
    const startMinimised = process.argv.includes('--start-minimised') || store.currentSettings().startMinimised;
    if (!startMinimised) mainWindow?.show();
  });
  mainWindow.on('close', (event) => {
    if (!quitting && store.currentSettings().closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const isThisMainFrame =
        details.resourceType === 'mainFrame' &&
        details.webContentsId === mainWindow?.webContents.id;
      if (!isThisMainFrame) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      const responseHeaders = { ...details.responseHeaders };
      for (const header of Object.keys(responseHeaders)) {
        if (header.toLowerCase() === 'content-security-policy') delete responseHeaders[header];
      }
      responseHeaders['Content-Security-Policy'] = [contentSecurityPolicy()];
      callback({ responseHeaders });
  });
  const devUrl = isDevelopment() ? process.env.ELECTRON_RENDERER_URL : undefined;
  if (devUrl) {
    console.info(`[main] Loading development renderer from ${devUrl}`);
  } else {
    console.info(`[main] Loading production renderer from ${join(__dirname, '../renderer/index.html')}`);
  }
  if (devUrl) {
    void mainWindow.loadURL(devUrl).catch((error: unknown) => {
      console.error(`[renderer load failure] Could not load ${devUrl}:`, error);
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html');
    void mainWindow.loadFile(rendererPath).catch((error: unknown) => {
      console.error(`[renderer load failure] Could not load ${rendererPath}:`, error);
    });
  }
  mainWindow.webContents.on('did-finish-load', () => {
    console.info(`[renderer loaded] ${mainWindow?.webContents.getURL()}`);
  });
  createTray();
}

function createTray(): void {
  if (tray) return;
  const trayIcon = nativeImage.createFromPath(join(__dirname, '../../icon.png'));
  if (trayIcon.isEmpty()) return;
  tray = new Tray(trayIcon);
  tray.setToolTip('Job Search');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Job Search', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

function broadcast(snapshot: AppSnapshot, notify: boolean): void {
  if (notify && snapshot.newJobsCount > 0 && store.currentSettings().notifyOnNewJobs && Notification.isSupported()) {
    new Notification({
      title: 'New UK jobs found',
      body: `${snapshot.newJobsCount} new job${snapshot.newJobsCount === 1 ? '' : 's'} match your search.`,
      icon: join(__dirname, '../../icon.png'),
    }).show();
  }
  mainWindow?.webContents.send('app:snapshot-updated', snapshot);
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const interval = store.currentSettings().refreshIntervalMinutes * 60_000;
  refreshTimer = setTimeout(async () => {
    try {
      for (const criteria of store.savedSearches()) {
        await searchService.search(criteria, true);
      }
    } catch (error) {
      dialog.showErrorBox(
        'Background refresh failed',
        error instanceof Error ? error.message : 'The saved searches could not be refreshed.',
      );
    } finally {
      scheduleRefresh();
    }
  }, interval);
}

function registerIpc(): void {
  ipcMain.handle('app:snapshot', (event) => {
    requireTrustedSender(event);
    return searchService.snapshot();
  });
  ipcMain.handle('jobs:search', async (event, value: unknown) => {
    requireTrustedSender(event);
    const criteria = criteriaSchema.parse(value) as SearchCriteria;
    return searchService.search(criteria);
  });
  ipcMain.handle('searches:save', async (event, value: unknown) => {
    requireTrustedSender(event);
    const criteria = criteriaSchema.parse(value) as SearchCriteria;
    const searches = store.savedSearches().filter((item) => item.id !== criteria.id);
    await store.update({ savedSearches: [...searches, criteria] });
    scheduleRefresh();
    return searchService.snapshot();
  });
  ipcMain.handle('searches:delete', async (event, value: unknown) => {
    requireTrustedSender(event);
    const id = z.string().min(1).max(100).parse(value);
    await store.update({ savedSearches: store.savedSearches().filter((item) => item.id !== id) });
    scheduleRefresh();
    return searchService.snapshot();
  });
  ipcMain.handle('settings:update', async (event, value: unknown) => {
    requireTrustedSender(event);
    const settings = settingsSchema.parse(value) as AppSettings;
    await store.update({ settings });
    mainWindow?.setTitleBarOverlay({ ...titleBarColors(), height: 42 });
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      args: settings.startMinimised ? ['--start-minimised'] : [],
    });
    scheduleRefresh();
    return searchService.snapshot();
  });
  ipcMain.handle('keys:save', async (event, providerValue: unknown, keyValue: unknown) => {
    requireTrustedSender(event);
    const providerId = z.enum(['reed', 'adzuna', 'jooble']).parse(providerValue);
    const key = z.string().trim().min(1).max(500).parse(keyValue);
    await store.setApiKey(providerId, key);
    return searchService.snapshot();
  });
  ipcMain.handle('providers:statuses', (event) => {
    requireTrustedSender(event);
    return searchService.getProviderStatuses();
  });
  ipcMain.handle('tracker:update', async (event, value: unknown) => {
    requireTrustedSender(event);
    const entry = trackerSchema.parse(value) as TrackerEntry;
    if (!store.jobs().some((job) => job.id === entry.jobId)) throw new Error('That job is no longer available.');
    await store.addTracker(entry);
    return searchService.snapshot();
  });
  ipcMain.handle('external:open', async (event, value: unknown) => {
    requireTrustedSender(event);
    const url = z.string().url().parse(value);
    if (new URL(url).protocol !== 'https:') throw new Error('Only HTTPS links can be opened.');
    await shell.openExternal(url);
  });
  ipcMain.handle('jobs:export', async (event, value: unknown) => {
    requireTrustedSender(event);
    const format = z.enum(['csv', 'json']).parse(value);
    const extension = format === 'csv' ? 'csv' : 'json';
    const options = {
      defaultPath: `job-search-export.${extension}`,
      filters: [{ name: format.toUpperCase(), extensions: [extension] }],
    };
    const destination = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (destination.canceled || !destination.filePath) return false;
    const jobs = store.jobs();
    const content = format === 'json' ? JSON.stringify(jobs, null, 2) : jobsToCsv(jobs);
    await writeFile(destination.filePath, content, 'utf8');
    return true;
  });
  ipcMain.on('app:install-update', (event) => {
    if (isTrustedSender(event.senderFrame?.url ?? '')) autoUpdater.quitAndInstall();
  });
}

function jobsToCsv(jobs: Job[]): string {
  const columns: Array<keyof Job | 'sourceName'> = [
    'id', 'title', 'company', 'location', 'salaryMin', 'salaryMax', 'salaryPeriod',
    'contractType', 'remote', 'description', 'postedAt', 'url', 'sourceName',
  ];
  const rows = jobs.map((job) => columns.map((column) => {
    const value = column === 'sourceName' ? job.source.name : job[column];
    const cell = value === null || value === undefined ? '' : String(value);
    return `"${cell.replace(/"/g, '""')}"`;
  }).join(','));
  return `${columns.join(',')}\r\n${rows.join('\r\n')}`;
}

async function startApp(): Promise<void> {
  store = new AppStore();
  await store.load();
  searchService = new SearchService(store, broadcast);
  nativeTheme.on('updated', () => mainWindow?.setTitleBarOverlay({ ...titleBarColors(), height: 42 }));
  registerIpc();
  createWindow();
  scheduleRefresh();
  if (app.isPackaged) {
    autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('app:update-ready'));
    autoUpdater.on('error', (error) => dialog.showErrorBox('Update check failed', error.message));
    void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
      dialog.showErrorBox('Update check failed', error instanceof Error ? error.message : 'The update check could not be completed.');
    });
  }
  mainWindow?.webContents.once('did-finish-load', async () => {
    const firstSearch = store.savedSearches()[0];
    if (firstSearch) {
      const snapshot = await searchService.search(firstSearch);
      mainWindow?.webContents.send('app:snapshot-updated', snapshot);
    }
  });
}

void app.whenReady().then(startApp).catch((error: unknown) => {
  dialog.showErrorBox('Job Search could not start', error instanceof Error ? error.message : 'An unexpected startup error occurred.');
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});
app.on('before-quit', () => {
  quitting = true;
  if (refreshTimer) clearTimeout(refreshTimer);
});
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && !quitting) return;
  if (!store?.currentSettings().closeToTray) app.quit();
});
