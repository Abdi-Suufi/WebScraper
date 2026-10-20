import {
  BellRing,
  BriefcaseBusiness,
  CalendarDays,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ContractType, SearchCriteria } from '@shared/types';

interface Props {
  searches: SearchCriteria[];
  activeSearchId: string;
  onSelect(search: SearchCriteria): void;
  onSave(search: SearchCriteria): Promise<void>;
  onDelete(id: string): Promise<void>;
}

const blankSearch = (): SearchCriteria => ({
  id: crypto.randomUUID(),
  name: '',
  keywords: '',
  location: 'Bristol',
  radiusMiles: 25,
  minimumSalary: null,
  contractType: 'any',
  remote: false,
  postedWithinDays: 30,
  unfilteredLocationMode: 'matches-location',
});

export function SearchesPage({ searches, activeSearchId, onSelect, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<SearchCriteria | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await onSave({
        ...editing,
        name: editing.name.trim() || editing.keywords,
        keywords: editing.keywords.trim(),
        location: editing.location.trim(),
      });
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-content searches-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><Search size={13} /> PERSONALISE YOUR FEED</div>
          <h1>Saved searches</h1>
          <p>Build focused searches and let new UK opportunities come to you.</p>
        </div>
        <button className="button-primary" onClick={() => setEditing(blankSearch())}><Plus size={16} /> New search</button>
      </div>
      <div className="searches-layout">
        <section className="searches-list" aria-label="Your saved searches">
          {searches.length === 0 ? (
            <div className="empty-card"><div className="empty-icon"><Search size={20} /></div><h3>No saved searches</h3><p>Create a search for roles you care about. Bristol is set as the default location.</p><button className="button-primary" onClick={() => setEditing(blankSearch())}><Plus size={15} /> Create a search</button></div>
          ) : searches.map((search) => (
            <article className={`saved-search-card ${search.id === activeSearchId ? 'current' : ''}`} key={search.id}>
              <div className="saved-search-icon"><BriefcaseBusiness size={18} /></div>
              <div className="saved-search-info">
                <div className="saved-search-title-row"><h2>{search.name}</h2>{search.id === activeSearchId && <span className="active-pill">Active</span>}</div>
                <div className="saved-search-keywords">{search.keywords}</div>
                <div className="saved-search-meta">
                  <span><MapPin size={13} />{search.location} · {search.radiusMiles} mi</span>
                  <span><CalendarDays size={13} />Last {search.postedWithinDays} days</span>
                  {search.minimumSalary !== null && <span>£{search.minimumSalary.toLocaleString()}+</span>}
                  {search.remote && <span>Remote</span>}
                  {search.contractType !== 'any' && <span>{contractLabel(search.contractType)}</span>}
                </div>
              </div>
              <div className="saved-search-actions">
                <button className="icon-button" aria-label={`Edit ${search.name}`} onClick={() => setEditing({ ...search })}><Pencil size={15} /></button>
                <button className="icon-button danger-action" aria-label={`Delete ${search.name}`} onClick={() => void onDelete(search.id)}><Trash2 size={15} /></button>
                <button className="button-secondary compact" onClick={() => onSelect(search)}>Open search</button>
              </div>
            </article>
          ))}
          <div className="refresh-note"><BellRing size={15} /> New matches refresh every hour by default. Configure refresh and notifications in Settings.</div>
        </section>

        <aside className="search-tips">
          <div className="tips-sparkle"><Search size={17} /></div>
          <h3>Search with intention</h3>
          <p>Use a role title or a few focused keywords. Broader terms help surface more opportunities across providers.</p>
          <div className="tip-divider" />
          <span className="tips-label">EXAMPLE SEARCH</span>
          <div className="example-search">“Product designer”</div>
          <div className="example-location"><MapPin size={13} /> Bristol, within 25 mi</div>
          <div className="tip-divider" />
          <span className="tips-label">A NOTE ON RESULTS</span>
          <p>Job availability and details vary by source. Open the original listing to apply and confirm it is still live.</p>
        </aside>
      </div>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="search-modal-title">
            <div className="modal-heading"><div><div className="eyebrow">SEARCH DETAILS</div><h2 id="search-modal-title">{searches.some((search) => search.id === editing.id) ? 'Edit search' : 'Create a saved search'}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setEditing(null)}>×</button></div>
            <form className="form-grid" onSubmit={(event) => void submit(event)}>
              <label className="field full-width">Search name<input autoFocus value={editing.name} placeholder="e.g. Senior product roles" onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
              <label className="field full-width">Job titles or keywords<input required value={editing.keywords} placeholder="e.g. software engineer, data analyst" onChange={(event) => setEditing({ ...editing, keywords: event.target.value })} /></label>
              <label className="field">Location<input required value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })} /></label>
              <label className="field">Radius<select value={editing.radiusMiles} onChange={(event) => setEditing({ ...editing, radiusMiles: Number(event.target.value) })}>{[5, 10, 15, 25, 50, 100].map((mile) => <option key={mile} value={mile}>{mile} miles</option>)}</select></label>
              <label className="field">Minimum salary<input type="number" min="0" max="1000000" step="1000" value={editing.minimumSalary ?? ''} placeholder="No minimum" onChange={(event) => setEditing({ ...editing, minimumSalary: event.target.value ? Number(event.target.value) : null })} /></label>
              <label className="field">Contract type<select value={editing.contractType} onChange={(event) => setEditing({ ...editing, contractType: event.target.value as SearchCriteria['contractType'] })}><option value="any">Any type</option><option value="permanent">Permanent</option><option value="contract">Contract</option><option value="part-time">Part-time</option></select></label>
              <label className="field">Posted within<select value={editing.postedWithinDays} onChange={(event) => setEditing({ ...editing, postedWithinDays: Number(event.target.value) })}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
              <label className="check-filter form-check"><input type="checkbox" checked={editing.remote} onChange={(event) => setEditing({ ...editing, remote: event.target.checked })} /> Remote roles only</label>
              <div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save search'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function contractLabel(type: ContractType): string {
  return type === 'part-time' ? 'Part-time' : type[0].toUpperCase() + type.slice(1);
}
