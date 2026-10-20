import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  MessageSquareText,
  Plus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppSnapshot, Job, TrackerEntry, TrackerStatus } from '@shared/types';
import { errorText } from '../App';
import { timeAgo } from './JobsPage';

interface Props {
  snapshot: AppSnapshot | null;
  onSnapshot(snapshot: AppSnapshot | null): void;
  onError(message: string): void;
}

const statuses: TrackerStatus[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

export function TrackerPage({ snapshot, onSnapshot, onError }: Props) {
  const [view, setView] = useState<'board' | 'list'>('board');
  const trackerByJob = useMemo(() => new Map((snapshot?.tracker ?? []).map((entry) => [entry.jobId, entry])), [snapshot?.tracker]);
  const tracked = useMemo(() => (snapshot?.jobs ?? []).flatMap((job) => {
    const entry = trackerByJob.get(job.id);
    return entry ? [{ job, entry }] : [];
  }), [snapshot?.jobs, trackerByJob]);

  async function update(entry: TrackerEntry): Promise<void> {
    try {
      onSnapshot(await window.jobApp.updateTracker({ ...entry, updatedAt: new Date().toISOString() }));
    } catch (error) {
      onError(errorText(error));
    }
  }

  return (
    <div className="page-content tracker-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><BriefcaseBusiness size={13} /> KEEP YOUR SEARCH MOVING</div>
          <h1>Application tracker</h1>
          <p>A calm place to keep tabs on every opportunity and next step.</p>
        </div>
        <div className="view-toggle" role="group" aria-label="Tracker layout">
          <button className={view === 'board' ? 'selected' : ''} onClick={() => setView('board')}>Board</button>
          <button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}>List</button>
        </div>
      </div>
      <div className="tracker-summary">
        {statuses.slice(0, 4).map((status) => <div className="tracker-stat" key={status}><span className={`tracker-status-dot status-dot-${slug(status)}`} /><span>{status}</span><strong>{tracked.filter(({ entry }) => entry.status === status).length}</strong></div>)}
      </div>
      {tracked.length === 0 ? (
        <div className="empty-card tracker-empty"><div className="empty-icon"><BriefcaseBusiness size={20} /></div><h3>Your tracker is ready</h3><p>Save jobs from the results list to start tracking applications, interviews and offers.</p><button className="button-secondary" onClick={() => document.querySelector<HTMLButtonElement>('.nav-item')?.click()}><Plus size={15} /> Find jobs</button></div>
      ) : view === 'board' ? (
        <div className="tracker-board">
          {statuses.map((status) => {
            const entries = tracked.filter((item) => item.entry.status === status);
            return (
              <section className="tracker-column" key={status}>
                <div className="tracker-column-heading"><span className={`tracker-status-dot status-dot-${slug(status)}`} /><strong>{status}</strong><span className="column-count">{entries.length}</span></div>
                <div className="tracker-column-content">
                  {entries.length ? entries.map(({ job, entry }) => <TrackerCard key={job.id} job={job} entry={entry} onUpdate={update} />) : <div className="column-empty">No roles here yet</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="tracker-table">
          <div className="tracker-table-head"><span>ROLE</span><span>STATUS</span><span>LAST UPDATED</span><span>NOTES</span><span /></div>
          {tracked.map(({ job, entry }) => (
            <div className="tracker-table-row" key={job.id}>
              <div className="tracker-role-cell"><strong>{job.title}</strong><span>{job.company} · {job.location}</span></div>
              <select aria-label={`Status for ${job.title}`} value={entry.status} onChange={(event) => void update({ ...entry, status: event.target.value as TrackerStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
              <span className="tracker-updated">{timeAgo(entry.updatedAt)}</span>
              <span className="tracker-notes-preview">{entry.notes || '—'}</span>
              <button className="icon-button" aria-label={`Open ${job.title}`} onClick={() => void window.jobApp.openExternal(job.url)}><ArrowUpRight size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackerCard({ job, entry, onUpdate }: { job: Job; entry: TrackerEntry; onUpdate(entry: TrackerEntry): void }) {
  const [notes, setNotes] = useState(entry.notes);
  const [editingNotes, setEditingNotes] = useState(false);
  return (
    <article className="tracker-card">
      <div className="tracker-card-source">{job.source.name}<button className="icon-button" aria-label={`Open ${job.title}`} onClick={() => void window.jobApp.openExternal(job.url)}><ArrowUpRight size={14} /></button></div>
      <h3>{job.title}</h3>
      <div className="tracker-company">{job.company}</div>
      <div className="tracker-card-location">{job.location}</div>
      <label className="tracker-status-select">Status<select value={entry.status} onChange={(event) => onUpdate({ ...entry, status: event.target.value as TrackerStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      {editingNotes ? (
        <div className="tracker-notes-edit"><textarea aria-label={`Notes for ${job.title}`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a reminder or note…" /><button className="button-primary compact" onClick={() => { onUpdate({ ...entry, notes }); setEditingNotes(false); }}>Save note</button></div>
      ) : (
        <button className="tracker-note-button" onClick={() => setEditingNotes(true)}><MessageSquareText size={14} />{entry.notes || 'Add a note'}</button>
      )}
      <div className="tracker-card-footer"><CalendarDays size={13} /> Updated {timeAgo(entry.updatedAt)}</div>
    </article>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-');
}
