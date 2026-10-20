import {
  BriefcaseBusiness,
  Bookmark,
  ChevronDown,
  CircleHelp,
  Command,
  Download,
  LayoutGrid,
  ListChecks,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppSettings, Page, SearchCriteria } from '@shared/types';
import { JobsPage } from './pages/JobsPage';
import { SearchesPage } from './pages/SearchesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TrackerPage } from './pages/TrackerPage';
import { useAppStore } from './store';

const navigation: Array<{ id: Page; label: string; icon: typeof BriefcaseBusiness }> = [
  { id: 'jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { id: 'searches', label: 'Saved searches', icon: Bookmark },
  { id: 'tracker', label: 'Application tracker', icon: ListChecks },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export default function App() {
  const {
    snapshot, page, activeSearchId, selectedJobId, loading, error, updateReady,
    setPage, selectJob, setSnapshot, setLoading, setError, setUpdateReady, clearUpdateReady, setActiveSearch,
  } = useAppStore();
  const [keywordDraft, setKeywordDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [splitPercent, setSplitPercent] = useState(53);
  const searchInput = useRef<HTMLInputElement>(null);
  const activeSearch = snapshot?.savedSearches.find((search) => search.id === activeSearchId)
    ?? snapshot?.savedSearches[0];
  const selectedJob = snapshot?.jobs.find((job) => job.id === selectedJobId) ?? null;
  const newCount = snapshot?.newJobsCount ?? 0;
  const savedJobsCount = snapshot?.tracker.filter((entry) => entry.status === 'Saved').length ?? 0;

  const updateSnapshot = (next: typeof snapshot): void => {
    if (next) {
      setSnapshot(next);
      const resolved = next.settings.theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : next.settings.theme;
      document.documentElement.dataset.theme = resolved;
    }
  };

  useEffect(() => {
    let mounted = true;
    void window.jobApp.getSnapshot().then((data) => {
      if (mounted) updateSnapshot(data);
    }).catch((cause: unknown) => {
      if (mounted) setError(errorText(cause));
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    const unlistenSnapshot = window.jobApp.onSnapshot(updateSnapshot);
    const unlistenUpdate = window.jobApp.onUpdateReady(() => setUpdateReady());
    return () => {
      mounted = false;
      unlistenSnapshot();
      unlistenUpdate();
    };
  }, []);

  useEffect(() => {
    setKeywordDraft(activeSearch?.keywords ?? '');
  }, [activeSearch?.id]);

  useEffect(() => {
    if (snapshot?.settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = (): void => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
    };
    applySystemTheme();
    media.addEventListener('change', applySystemTheme);
    return () => media.removeEventListener('change', applySystemTheme);
  }, [snapshot?.settings.theme]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPage('jobs');
        window.setTimeout(() => searchInput.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setPage]);

  async function runSearch(criteria: SearchCriteria): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const next = await window.jobApp.search(criteria);
      updateSnapshot(next);
      selectJob(next.jobs.find((job) => job.isNew)?.id ?? next.jobs[0]?.id ?? null);
      setNotice(next.jobs.length ? `Search complete · ${next.jobs.length.toLocaleString()} jobs in your library` : 'Search complete · no matches yet');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }

  async function changeSettings(settings: AppSettings): Promise<void> {
    try {
      const next = await window.jobApp.updateSettings(settings);
      updateSnapshot(next);
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="titlebar-brand">
          <span className="brand-mark"><Sparkles size={15} /></span>
          <span>Northstar <span className="brand-light">Jobs</span></span>
        </div>
        <div className="titlebar-caption">UK job search</div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="location-pill"><span className="location-dot" /> {activeSearch?.location ?? 'Bristol'}, UK <ChevronDown size={14} /></div>
          <div className="side-section-label">WORKSPACE</div>
          <nav className="primary-nav" aria-label="Main navigation">
            {navigation.map(({ id, label, icon: Icon }, index) => (
              <button
                className={`nav-item ${page === id ? 'active' : ''}`}
                key={id}
                onClick={() => setPage(id)}
                aria-current={page === id ? 'page' : undefined}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
                {id === 'jobs' && newCount > 0 && <span className="nav-count">{newCount}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <div className="sidebar-summary">
            <div className="summary-icon"><LayoutGrid size={15} /></div>
            <div>
              <strong>{snapshot?.jobs.length ?? 0} in library</strong>
              <span>{savedJobsCount} Saved · {snapshot?.savedSearches.length ?? 0} searches</span>
            </div>
          </div>
          <button className="sidebar-help" onClick={() => setPage('settings')}>
            <CircleHelp size={16} /> Help &amp; sources
          </button>
          <div className="user-profile">
            <div className="avatar">JS</div>
            <div className="profile-text"><strong>Your workspace</strong><span>Personal edition</span></div>
            <button className="icon-button profile-menu" aria-label="Workspace options" onClick={() => setPage('settings')}>
              <ChevronDown size={15} />
            </button>
          </div>
        </aside>

        <main className="main-area">
          <div className="main-topbar">
            <div className="breadcrumbs">
              <span>Workspace</span><span className="crumb-divider">/</span>
              <strong>{navigation.find((item) => item.id === page)?.label}</strong>
            </div>
            <div className="topbar-actions">
              {page === 'jobs' && (
                <button className="quiet-button" onClick={() => void window.jobApp.exportJobs('csv').then((ok) => setNotice(ok ? 'CSV export saved' : 'Export cancelled')).catch((e: unknown) => setError(errorText(e)))}>
                  <Download size={15} /> Export
                </button>
              )}
              <div className="keyboard-hint"><Command size={13} /> K</div>
            </div>
          </div>
          {error && <div role="alert" className="global-error"><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}
          {notice && <div className="toast" role="status" onAnimationEnd={() => window.setTimeout(() => setNotice(''), 2200)}>{notice}</div>}

          {page === 'jobs' && (
            <JobsPage
              activeSearch={activeSearch}
              keywordDraft={keywordDraft}
              setKeywordDraft={setKeywordDraft}
              searchInput={searchInput}
              loading={loading}
              selectedJob={selectedJob}
              onSearch={() => activeSearch && void runSearch({ ...activeSearch, keywords: keywordDraft.trim() || activeSearch.keywords })}
              onSelect={selectJob}
              splitPercent={splitPercent}
              setSplitPercent={setSplitPercent}
              onSnapshot={updateSnapshot}
              onCriteriaChange={async (criteria) => {
                try {
                  updateSnapshot(await window.jobApp.saveSearch(criteria));
                } catch (cause) {
                  setError(errorText(cause));
                }
              }}
            />
          )}
          {page === 'searches' && (
            <SearchesPage
              searches={snapshot?.savedSearches ?? []}
              activeSearchId={activeSearchId}
              onSelect={(search) => { setActiveSearch(search.id); setPage('jobs'); }}
              onSave={async (search) => {
                try {
                  updateSnapshot(await window.jobApp.saveSearch(search));
                  setActiveSearch(search.id);
                  setNotice('Search saved');
                } catch (cause) { setError(errorText(cause)); }
              }}
              onDelete={async (id) => {
                try {
                  updateSnapshot(await window.jobApp.deleteSearch(id));
                  setNotice('Search removed');
                } catch (cause) { setError(errorText(cause)); }
              }}
            />
          )}
          {page === 'tracker' && <TrackerPage snapshot={snapshot} onSnapshot={updateSnapshot} onError={(message) => setError(message)} />}
          {page === 'settings' && snapshot && (
            <SettingsPage snapshot={snapshot} onSettingsChange={changeSettings} onSnapshot={updateSnapshot} onError={(message) => setError(message)} />
          )}
        </main>
      </div>
      {updateReady && (
        <div className="update-banner">
          <span>A new version is ready to install.</span>
          <button onClick={() => window.jobApp.installUpdate()}>Restart to update</button>
          <button className="icon-button" aria-label="Dismiss update prompt" onClick={clearUpdateReady}>×</button>
        </div>
      )}
      <div className="sr-only" aria-live="polite">{newCount ? `${newCount} new jobs found` : ''}</div>
    </div>
  );
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
