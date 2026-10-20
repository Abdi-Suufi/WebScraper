import {
  ArrowDownWideNarrow,
  BriefcaseBusiness,
  ArrowUpRight,
  BookmarkPlus,
  Check,
  Clock3,
  MapPin,
  MoreHorizontal,
  Radio,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactNode, RefObject } from 'react';
import type { AppSnapshot, Job, SearchCriteria } from '@shared/types';
import type { UnfilteredLocationMode } from '@shared/types';
import { matchesUnfilteredLocation } from '@shared/location';
import { errorText } from '../App';
import { useAppStore } from '../store';

interface Props {
  activeSearch: SearchCriteria | undefined;
  keywordDraft: string;
  setKeywordDraft(value: string): void;
  searchInput: RefObject<HTMLInputElement | null>;
  loading: boolean;
  selectedJob: Job | null;
  onSearch(): void;
  onSelect(id: string | null): void;
  splitPercent: number;
  setSplitPercent(value: number): void;
  onSnapshot(snapshot: AppSnapshot | null): void;
  onCriteriaChange(criteria: SearchCriteria): Promise<void>;
}

type SortMode = 'newest' | 'salary' | 'relevance';

export function JobsPage({
  activeSearch, keywordDraft, setKeywordDraft, searchInput, loading, selectedJob, onSearch,
  onSelect, splitPercent, setSplitPercent, onSnapshot,
  onCriteriaChange,
}: Props) {
  const { snapshot } = useAppSnapshot();
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const separatorRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const jobs = useMemo(() => {
    const keywords = keywordDraft.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = (snapshot?.jobs ?? []).filter((job) => {
      const text = `${job.title} ${job.company} ${job.description}`.toLowerCase();
      if (keywords.length && !keywords.every((word) => text.includes(word))) return false;
      if (remoteOnly && !job.remote) return false;
      if (newOnly && !job.isNew) return false;
      if (activeSearch && !matchesUnfilteredLocation(job, activeSearch)) {
        return false;
      }
      return true;
    });
    return matching.sort((a, b) => {
      if (sortMode === 'salary') return (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0);
      if (sortMode === 'relevance') return b.relevance - a.relevance;
      return (b.postedAt ? new Date(b.postedAt).getTime() : 0) - (a.postedAt ? new Date(a.postedAt).getTime() : 0);
    });
  }, [snapshot?.jobs, keywordDraft, remoteOnly, newOnly, sortMode, activeSearch]);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current) return;
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    setSplitPercent(Math.max(38, Math.min(68, ((event.clientX - rect.left) / rect.width) * 100)));
  }

  async function saveJob(job: Job): Promise<void> {
    try {
      const next = await window.jobApp.updateTracker({
        jobId: job.id,
        status: 'Saved',
        notes: '',
        updatedAt: new Date().toISOString(),
      });
      onSnapshot(next);
    } catch (error) {
      window.alert(errorText(error));
    }
  }

  if (!activeSearch) return <div className="page-content"><EmptyState title="Create your first search" body="Set up keywords, location and preferences to start finding UK roles." /></div>;

  return (
    <div className="jobs-page">
      <div className="page-heading jobs-heading">
        <div>
          <div className="eyebrow"><Radio size={13} /> LIVE JOB FEED</div>
          <h1>Find your next move</h1>
          <p>Opportunities from trusted UK sources, brought together in one place.</p>
        </div>
        <div className="heading-meta">
          <span className="live-indicator"><span /> Sources active</span>
          <span className="heading-separator" />
          <span className="last-search">{snapshot?.lastSearchAt ? `Updated ${timeAgo(snapshot.lastSearchAt)}` : 'Not searched yet'}</span>
        </div>
      </div>

      <form className="search-panel" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
        <div className="search-field">
          <Search size={18} />
          <label className="sr-only" htmlFor="job-keywords">Job title or keywords</label>
          <input
            id="job-keywords"
            ref={searchInput}
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            placeholder="Job title, skills or company"
          />
          {keywordDraft && <button type="button" className="icon-button search-clear" onClick={() => setKeywordDraft('')} aria-label="Clear search"><X size={15} /></button>}
        </div>
        <div className="search-location"><MapPin size={17} /><span>{activeSearch.location}</span><span className="radius-label">{activeSearch.radiusMiles} mi</span></div>
        <button className="button-primary search-button" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : <Search size={16} />}
          {loading ? 'Searching' : 'Search jobs'}
        </button>
      </form>

      <div className="results-toolbar">
        <div className="results-count">
          <strong>{jobs.length}</strong> {jobs.length === 1 ? 'role shown' : 'roles shown'}
          <span className="library-count">{snapshot?.jobs.length ?? 0} in library</span>
          <span className="saved-count">{snapshot?.tracker.filter((entry) => entry.status === 'Saved').length ?? 0} Saved</span>
          {newCount(snapshot?.jobs ?? []) > 0 && <span className="new-badge"><Sparkles size={12} /> {newCount(snapshot?.jobs ?? [])} new</span>}
        </div>
        <div className="toolbar-controls">
          <button className={`filter-toggle ${filtersOpen ? 'selected' : ''}`} onClick={() => setFiltersOpen((value) => !value)}>
            <SlidersHorizontal size={15} /> Filters
          </button>
          <label className="sort-label" htmlFor="sort-jobs"><ArrowDownWideNarrow size={15} /><span>Sort</span></label>
          <select id="sort-jobs" className="select-compact" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="newest">Newest</option>
            <option value="salary">Salary</option>
            <option value="relevance">Relevance</option>
          </select>
          <button
            className="icon-button more-action"
            aria-label="Export jobs as JSON"
            title="Export jobs as JSON"
            onClick={() => void window.jobApp.exportJobs('json')
              .then((saved) => { if (saved) window.alert('JSON export saved.'); })
              .catch((error: unknown) => window.alert(errorText(error)))}
          ><MoreHorizontal size={18} /></button>
        </div>
      </div>
      <div className="provider-location-row">
        <label htmlFor="unfiltered-location-mode">Arbeitnow &amp; DevITjobs location matching</label>
        <select
          id="unfiltered-location-mode"
          className="select-compact"
          value={activeSearch.unfilteredLocationMode}
          onChange={(event) => void onCriteriaChange({
            ...activeSearch,
            unfilteredLocationMode: event.target.value as UnfilteredLocationMode,
          })}
        >
          <option value="matches-location">Matches my location</option>
          <option value="remote-uk">Remote (UK)</option>
          <option value="anywhere-uk">Anywhere in the UK</option>
        </select>
        <span>
          These sources cannot filter by distance. Rule in effect: <strong>{locationModeLabel(activeSearch.unfilteredLocationMode)}</strong>
          {activeSearch.unfilteredLocationMode === 'matches-location' ? ` · ${activeSearch.location}` : ''}
        </span>
      </div>
      {filtersOpen && (
        <div className="filter-row">
          <label className="check-filter"><input type="checkbox" checked={newOnly} onChange={(event) => setNewOnly(event.target.checked)} /> New since last search</label>
          <label className="check-filter"><input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} /> Remote</label>
          <span className="filter-helper">Search windows follow “{activeSearch.name}”.</span>
        </div>
      )}

      <div
        className="results-layout"
        style={{ gridTemplateColumns: `minmax(360px, ${splitPercent}fr) 6px minmax(350px, ${100 - splitPercent}fr)` }}
      >
        <section className="job-list" aria-label="Job results">
          {loading && jobs.length === 0 ? (
            <div className="skeleton-stack" aria-label="Loading jobs">
              {[0, 1, 2, 3].map((item) => <div className="job-skeleton" key={item}><div /><div /><div /></div>)}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              title={snapshot?.jobs.length ? 'No jobs match these filters' : 'Your next opportunity starts here'}
              body={snapshot?.jobs.length ? 'Try clearing a filter or broadening your keywords.' : 'Search to bring together roles from your enabled sources. Add API keys in Settings for Reed and Adzuna.'}
              action={snapshot?.jobs.length ? <button className="button-secondary" onClick={() => { setNewOnly(false); setRemoteOnly(false); setKeywordDraft(''); }}>Clear filters</button> : undefined}
            />
          ) : (
            jobs.map((job) => (
              <article className={`job-card ${selectedJob?.id === job.id ? 'selected' : ''}`} key={job.id} onClick={() => onSelect(job.id)}>
                <div className="job-card-top">
                  <span className={`source-dot source-${job.source.id}`} />
                  <span className="source-label">{job.source.name}</span>
                  {job.isNew && <span className="card-new">NEW</span>}
                  <button className="save-job" aria-label={`Save ${job.title}`} onClick={(event) => { event.stopPropagation(); void saveJob(job); }}><BookmarkPlus size={17} /></button>
                </div>
                <h2><button className="job-title-button" onClick={() => onSelect(job.id)}>{job.title}</button></h2>
                <div className="job-company">{job.company}</div>
                {job.description && <p className="job-card-preview">{job.description}</p>}
                <div className="job-meta">
                  <span><MapPin size={13} />{job.location}</span>
                  {job.postedAt && <span><Clock3 size={13} />{timeAgo(job.postedAt)}</span>}
                </div>
                <div className="job-card-bottom">
                  <span className="salary">{formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}</span>
                  <span className="job-tags">{job.contractType && <span>{prettyContract(job.contractType)}</span>}{job.remote && <span>Remote</span>}</span>
                </div>
              </article>
            ))
          )}
        </section>
        <div
          ref={separatorRef}
          className="resize-handle"
          role="separator"
          aria-label="Resize job list and details"
          aria-orientation="vertical"
          aria-valuenow={Math.round(splitPercent)}
          tabIndex={0}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={() => { dragging.current = false; }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setSplitPercent(Math.max(38, splitPercent - 3));
            if (event.key === 'ArrowRight') setSplitPercent(Math.min(68, splitPercent + 3));
          }}
        ><span /></div>
        <aside className="job-detail" aria-label="Job details">
          {selectedJob ? (
            <>
              <div className="detail-topline">
                <div className="detail-source"><span className={`source-dot source-${selectedJob.source.id}`} /> {selectedJob.source.name}</div>
                <button className="icon-button" aria-label="Close details" onClick={() => onSelect(null)}><X size={17} /></button>
              </div>
              {selectedJob.isNew && <div className="detail-new"><Sparkles size={13} /> Newly found</div>}
              <h2 className="detail-title">{selectedJob.title}</h2>
              <div className="detail-company">{selectedJob.company}</div>
              <div className="detail-location"><MapPin size={15} />{selectedJob.location}</div>
              <div className="detail-tags">
                <span className="detail-chip">{formatSalary(selectedJob.salaryMin, selectedJob.salaryMax, selectedJob.salaryPeriod)}</span>
                {selectedJob.contractType && <span className="detail-chip">{prettyContract(selectedJob.contractType)}</span>}
                {selectedJob.remote && <span className="detail-chip">Remote</span>}
              </div>
              <div className="detail-action-row">
                <button className="button-primary listing-button" onClick={() => void window.jobApp.openExternal(selectedJob.url)}>
                  Open listing <ArrowUpRight size={16} />
                </button>
                <button className="button-secondary" onClick={() => void saveJob(selectedJob)}><BookmarkPlus size={15} /> Save</button>
              </div>
              <div className="detail-rule" />
              <div className="detail-section-title">About this role</div>
              <p className="detail-description">{selectedJob.description || 'The source did not provide a full description. Open the original listing to learn more.'}</p>
              <div className="attribution">
                <Check size={14} /> Listing and attribution from <button onClick={() => void window.jobApp.openExternal(selectedJob.source.url)}>{selectedJob.source.name}</button>
              </div>
              <div className="detail-footer">
                <span>Posted {selectedJob.postedAt ? timeAgo(selectedJob.postedAt) : 'date not provided'}</span>
                <button onClick={() => void window.jobApp.openExternal(selectedJob.url)}>View original <ArrowUpRight size={13} /></button>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <div className="detail-empty-icon"><BriefcaseBusinessIcon /></div>
              <strong>Select a role to preview</strong>
              <span>Explore the full description and open the original listing.</span>
            </div>
          )}
        </aside>
      </div>
      <div className="source-footnote">Listings are provided by third-party sources. Always review details on the original job page.</div>
    </div>
  );
}

function useAppSnapshot() {
  return { snapshot: useAppStore((state) => state.snapshot) };
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Search size={20} /></div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function BriefcaseBusinessIcon() {
  return <BriefcaseBusiness size={22} />;
}

function newCount(jobs: Job[]): number {
  return jobs.filter((job) => job.isNew).length;
}

export function timeAgo(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSalary(min: number | null, max: number | null, period: string | null): string {
  if (min === null && max === null) return 'Salary not listed';
  const range = min !== null && max !== null && min !== max
    ? `${formatMoney(min)} – ${formatMoney(max)}`
    : formatMoney(min ?? max ?? 0);
  const unit = period ? ` / ${period === 'year' ? 'yr' : period}` : '';
  return `${range}${unit}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function prettyContract(value: string): string {
  return value === 'part-time' ? 'Part time' : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function locationModeLabel(value: UnfilteredLocationMode): string {
  if (value === 'remote-uk') return 'Remote (UK)';
  if (value === 'anywhere-uk') return 'Anywhere in the UK';
  return 'Matches my location';
}
