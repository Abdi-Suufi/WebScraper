import {
  ArrowUpRight,
  Bell,
  Check,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Monitor,
  Moon,
  Sun,
  Wifi,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AppSettings, AppSnapshot, ProviderStatus, ThemeMode } from '@shared/types';
import { errorText } from '../App';

interface Props {
  snapshot: AppSnapshot;
  onSettingsChange(settings: AppSettings): Promise<void>;
  onSnapshot(snapshot: AppSnapshot | null): void;
  onError(message: string): void;
}

export function SettingsPage({ snapshot, onSettingsChange, onSnapshot, onError }: Props) {
  const settings = snapshot.settings;
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [keySaved, setKeySaved] = useState<string | null>(null);

  async function toggleProvider(provider: ProviderStatus, enabled: boolean): Promise<void> {
    let linkedinAcknowledged = settings.linkedinAcknowledged;
    if (provider.id === 'linkedin' && enabled) {
      const accepted = window.confirm(
        'LinkedIn is experimental and reads public, logged-out job pages. LinkedIn’s terms do not permit automated access. It may stop working at any time and is intended for personal use only. Requests are limited and never use a login, cookies, proxies, or CAPTCHA solving. Enable this source?',
      );
      if (!accepted) return;
      linkedinAcknowledged = true;
    }
    await onSettingsChange({
      ...settings,
      linkedinAcknowledged,
      providerEnabled: { ...settings.providerEnabled, [provider.id]: enabled },
    });
  }

  async function saveKey(providerId: string): Promise<void> {
    const value = keyInputs[providerId]?.trim();
    if (!value) return;
    setSavingKey(providerId);
    try {
      onSnapshot(await window.jobApp.saveApiKey(providerId, value));
      setKeyInputs((current) => ({ ...current, [providerId]: '' }));
      setKeySaved(providerId);
      window.setTimeout(() => setKeySaved((current) => current === providerId ? null : current), 2500);
    } catch (error) {
      onError(errorText(error));
    } finally {
      setSavingKey(null);
    }
  }

  async function updateSetting(patch: Partial<AppSettings>): Promise<void> {
    await onSettingsChange({ ...settings, ...patch });
  }

  return (
    <div className="page-content settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><Wifi size={13} /> YOUR PREFERENCES</div>
          <h1>Settings</h1>
          <p>Choose the sources, refresh schedule and experience that work for you.</p>
        </div>
      </div>

      <section className="settings-section">
        <div className="section-heading">
          <div className="section-icon"><Wifi size={17} /></div>
          <div><h2>Job sources</h2><p>Sources run independently. One unavailable source won’t stop the others.</p></div>
        </div>
        <div className="provider-list">
          {snapshot.providerStatuses.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              enabled={settings.providerEnabled[provider.id] ?? false}
              keyValue={keyInputs[provider.id] ?? ''}
              saving={savingKey === provider.id}
              saved={keySaved === provider.id}
              visible={visibleKeys[provider.id] ?? false}
              onToggle={(enabled) => void toggleProvider(provider, enabled)}
              onKeyChange={(value) => setKeyInputs((current) => ({ ...current, [provider.id]: value }))}
              onSaveKey={() => void saveKey(provider.id)}
              onToggleVisibility={() => setVisibleKeys((current) => ({ ...current, [provider.id]: !current[provider.id] }))}
            />
          ))}
        </div>
        <p className="settings-footnote">Usage displays app-tracked requests this calendar month. Provider plan limits are set by each source and may change.</p>
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <div className="section-icon"><Bell size={17} /></div>
          <div><h2>Refresh &amp; notifications</h2><p>Keep your saved searches fresh without unnecessary requests.</p></div>
        </div>
        <div className="setting-row">
          <div className="setting-copy"><strong>Background refresh</strong><span>Refresh every {settings.refreshIntervalMinutes} minutes while the app is running.</span></div>
          <label className="field-inline">Every
            <select value={settings.refreshIntervalMinutes} onChange={(event) => void updateSetting({ refreshIntervalMinutes: Number(event.target.value) })}>
              {[15, 30, 60, 120, 240, 480, 1440].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min` : minutes === 1440 ? '24 hours' : `${minutes / 60} hr`}</option>)}
            </select>
          </label>
        </div>
        <SettingToggle icon={<Bell size={16} />} title="Windows notifications" description="Notify when a saved search finds new jobs." checked={settings.notifyOnNewJobs} onChange={(checked) => void updateSetting({ notifyOnNewJobs: checked })} />
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <div className="section-icon"><Monitor size={17} /></div>
          <div><h2>Appearance</h2><p>Keep it easy on the eyes in any light.</p></div>
        </div>
        <div className="theme-options" role="radiogroup" aria-label="Theme">
          {([
            ['system', <Monitor size={16} />, 'System'],
            ['light', <Sun size={16} />, 'Light'],
            ['dark', <Moon size={16} />, 'Dark'],
          ] as Array<[ThemeMode, ReactNode, string]>).map(([theme, icon, label]) => (
            <button key={theme} role="radio" aria-checked={settings.theme === theme} className={`theme-option ${settings.theme === theme ? 'selected' : ''}`} onClick={() => void updateSetting({ theme })}>
              {icon}<span>{label}</span>{settings.theme === theme && <Check size={14} />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-heading">
          <div className="section-icon"><Clock3 size={17} /></div>
          <div><h2>Startup &amp; window</h2><p>Set how Job Search behaves when you sign in or close the window.</p></div>
        </div>
        <SettingToggle icon={<Monitor size={16} />} title="Close to tray" description="Keep Job Search running when you close its window." checked={settings.closeToTray} onChange={(checked) => void updateSetting({ closeToTray: checked })} />
        <SettingToggle icon={<Clock3 size={16} />} title="Launch at login" description="Start Job Search when you sign into Windows." checked={settings.launchAtLogin} onChange={(checked) => void updateSetting({ launchAtLogin: checked })} />
        <SettingToggle icon={<Eye size={16} />} title="Start minimised" description="Open in the background when Windows starts the app." checked={settings.startMinimised} onChange={(checked) => void updateSetting({ startMinimised: checked })} />
      </section>
      <div className="security-note"><KeyRound size={16} /><span>Your API keys are encrypted with Windows secure storage and never sent to the renderer or included in exports.</span></div>
    </div>
  );
}

interface ProviderRowProps {
  provider: ProviderStatus;
  enabled: boolean;
  keyValue: string;
  saving: boolean;
  saved: boolean;
  visible: boolean;
  onToggle(enabled: boolean): void;
  onKeyChange(value: string): void;
  onSaveKey(): void;
  onToggleVisibility(): void;
}

function ProviderRow({
  provider, enabled, keyValue, saving, saved, visible, onToggle, onKeyChange, onSaveKey, onToggleVisibility,
}: ProviderRowProps) {
  const unavailable = provider.state === 'unavailable';
  const keyLabel = provider.id === 'adzuna' ? 'App ID, then app key (separate with a newline)' : 'API key';

  return (
    <article className={`provider-row ${provider.experimental ? 'experimental-row' : ''}`}>
      <div className="provider-main">
        <div className={`provider-mark provider-mark-${provider.id}`}>{provider.name.slice(0, 1)}</div>
        <div className="provider-info">
          <div className="provider-name-row"><strong>{provider.name}</strong>{provider.experimental && <span className="experimental-pill">EXPERIMENTAL</span>}</div>
          <span className={`provider-status status-${provider.state}`}>{provider.message}</span>
        </div>
        <div className="provider-usage"><span>{provider.callsThisMonth} calls</span><small>this month</small></div>
        {!(provider.id === 'linkedin' && provider.state === 'unavailable') ? (
          <label className="switch" aria-label={`${enabled ? 'Disable' : 'Enable'} ${provider.name}`}>
            <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
            <span className="switch-slider" />
          </label>
        ) : <span className="provider-excluded-label">Not included</span>}
      </div>
      {provider.experimental && enabled && (
        <div className="provider-notice">
          <strong>Personal-use notice</strong> — this reads LinkedIn’s public logged-out job pages. LinkedIn’s terms do not permit automated access; it may stop working at any time. No login, cookies, proxies, identity spoofing or CAPTCHA solving are used.
        </div>
      )}
      {enabled && provider.requiresKey && !unavailable && (
        <div className="key-entry">
          <div className="key-entry-header"><KeyRound size={14} /><span>{provider.state === 'needs-key' ? keyLabel : `Replace ${provider.id === 'adzuna' ? 'app ID and app key' : 'API key'}`}</span><button onClick={() => void window.jobApp.openExternal(provider.keyUrl ?? provider.docsUrl)}>Where to get it <ArrowUpRight size={13} /></button></div>
          <div className="key-input-row">
            {provider.id === 'adzuna' ? (
              <textarea
                aria-label="Adzuna App ID and App Key"
                rows={2}
                autoComplete="off"
                spellCheck={false}
                value={keyValue}
                onChange={(event) => onKeyChange(event.target.value)}
                placeholder={'app_id\napp_key'}
              />
            ) : (
              <>
                <input
                  aria-label={`${provider.name} API key`}
                  type={visible ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={keyValue}
                  onChange={(event) => onKeyChange(event.target.value)}
                  placeholder="Paste your API key"
                />
                <button className="icon-button" aria-label={visible ? 'Hide key' : 'Show key'} onClick={onToggleVisibility}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </>
            )}
            <button className="button-primary compact" onClick={onSaveKey} disabled={!keyValue.trim() || saving}>{saved ? <Check size={14} /> : <KeyRound size={14} />}{saved ? 'Saved' : saving ? 'Saving…' : 'Save key'}</button>
          </div>
          {provider.id === 'adzuna' && <span className="key-hint">Enter the App ID on the first line and App Key on the second.</span>}
        </div>
      )}
      {unavailable && (
        <div className="provider-unavailable">
          <span>{provider.id === 'jooble' ? 'Provider integration is paused because its current request/authentication details could not be verified.' : provider.message}</span>
          <button onClick={() => void window.jobApp.openExternal(provider.docsUrl)}>Documentation <ExternalLink size={13} /></button>
        </div>
      )}
      {!unavailable && (
        <div className="provider-footer">
          <span>{provider.requiresKey ? `Tracked API requests this month: ${provider.callsThisMonth}` : 'No API key required'}</span>
          <button onClick={() => void window.jobApp.openExternal(provider.docsUrl)}>Source details <ArrowUpRight size={13} /></button>
        </div>
      )}
    </article>
  );
}

function SettingToggle({
  icon, title, description, checked, onChange,
}: { icon: ReactNode; title: string; description: string; checked: boolean; onChange(checked: boolean): void }) {
  return (
    <div className="setting-row">
      <div className="setting-leading-icon">{icon}</div>
      <div className="setting-copy"><strong>{title}</strong><span>{description}</span></div>
      <label className="switch" aria-label={`${checked ? 'Disable' : 'Enable'} ${title}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="switch-slider" /></label>
    </div>
  );
}
