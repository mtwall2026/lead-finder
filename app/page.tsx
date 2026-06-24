'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

type Status = 'contacted' | 'follow_up' | 'pass' | null;
type Tab = 'engineering' | 'law';
type Filter = 'all' | 'contacted' | 'follow_up' | 'pass' | 'none';

interface Firm {
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
}

interface LeadData {
  status: Status;
  notes: string;
  followUpDate: string; // YYYY-MM-DD or ''
}

type LeadStore = Record<string, LeadData>;

const STATUS_CONFIG: Record<NonNullable<Status>, { label: string; active: string }> = {
  contacted: { label: 'Contacted', active: 'bg-[#1a35d0] text-white shadow-[0_0_10px_rgba(26,53,208,0.55)]' },
  follow_up: { label: 'Follow Up', active: 'bg-yellow-500 text-white shadow-[0_0_10px_rgba(234,179,8,0.5)]' },
  pass:      { label: 'Pass',      active: 'bg-slate-500 text-white' },
};

const FILTER_CONFIG: { key: Filter; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'pass',      label: 'Pass' },
  { key: 'none',      label: 'No Status' },
];

function defaultLead(): LeadData {
  return { status: null, notes: '', followUpDate: '' };
}

function getLead(store: LeadStore, id: string): LeadData {
  const v = store[id] as LeadData | Status;
  if (!v) return defaultLead();
  if (typeof v === 'string') return { status: v, notes: '', followUpDate: '' };
  return { status: v.status ?? null, notes: v.notes ?? '', followUpDate: v.followUpDate ?? '' };
}

function isOverdue(date: string): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

function isDueToday(date: string): boolean {
  if (!date) return false;
  return date === new Date().toISOString().split('T')[0];
}

export default function Home() {
  const { data: session, status: authStatus } = useSession();
  const [tab, setTab] = useState<Tab>('engineering');
  const [filter, setFilter] = useState<Filter>('all');
  const [firms, setFirms] = useState<Record<Tab, Firm[]>>({ engineering: [], law: [] });
  const [leads, setLeads] = useState<LeadStore>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    loadLeads();
  }, [session]);

  const loadLeads = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/statuses');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLeads(data);
      setDirty(false);
      setSyncMsg('Loaded from OneDrive');
    } catch (e) {
      setSyncMsg(`Load failed: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const saveLeads = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leads),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDirty(false);
      setSyncMsg('Saved to OneDrive');
    } catch (e) {
      setSyncMsg(`Save failed: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const updateLead = (id: string, updates: Partial<LeadData>) => {
    setLeads(prev => ({
      ...prev,
      [id]: { ...defaultLead(), ...getLead(prev, id), ...updates },
    }));
    setDirty(true);
    setSyncMsg(null);
  };

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/search');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFirms(data);
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (authStatus === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 tracking-widest uppercase text-sm animate-pulse">Loading...</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src="/logo.png" alt="Cirrobound" className="h-28 w-auto mx-auto mb-8" />
          <h1 className="text-3xl font-bold tracking-widest uppercase mb-2" style={{ textShadow: '0 0 24px rgba(26,53,208,0.75)' }}>
            Lead Finder
          </h1>
          <p className="text-slate-400 text-sm mb-8">Sign in with your Cirrobound Microsoft account to continue.</p>
          <a href="/signin" className="inline-block bg-[#1a35d0] hover:bg-[#2a4ae0] text-white font-bold px-8 py-3 rounded-lg transition-all duration-200 uppercase tracking-widest text-sm shadow-[0_0_24px_rgba(26,53,208,0.45)] hover:shadow-[0_0_36px_rgba(26,53,208,0.7)]">
            Sign in with Microsoft
          </a>
        </div>
      </main>
    );
  }

  const current = firms[tab];

  const filtered = current.filter(f => {
    const lead = getLead(leads, f.id);
    if (filter === 'all') return true;
    if (filter === 'none') return !lead.status;
    return lead.status === filter;
  });

  const stats = {
    contacted: current.filter(f => getLead(leads, f.id).status === 'contacted').length,
    follow_up: current.filter(f => getLead(leads, f.id).status === 'follow_up').length,
    pass:      current.filter(f => getLead(leads, f.id).status === 'pass').length,
    none:      current.filter(f => !getLead(leads, f.id).status).length,
  };

  return (
    <main className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <img src="/logo.png" alt="Cirrobound" className="h-40 w-auto shrink-0" />
            <div>
              <h1 className="text-4xl font-bold tracking-widest uppercase" style={{ textShadow: '0 0 24px rgba(26,53,208,0.75), 0 0 48px rgba(26,53,208,0.35)' }}>
                Lead Finder
              </h1>
              <p className="text-slate-400 text-sm tracking-wide mt-0.5">
                Engineering &amp; Law Firms · 50 mi radius · Spartanburg, SC
              </p>
            </div>
          </div>
          <div className="mt-5 h-px bg-gradient-to-r from-[#1a35d0] via-[#1a35d0]/25 to-transparent" />
        </div>

        {/* Sync bar */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={saveLeads}
            disabled={syncing || !dirty}
            className="text-xs font-semibold px-4 py-2 rounded-lg border transition-all disabled:opacity-40 bg-[#1a35d0] border-[#1a35d0] text-white hover:bg-[#2a4ae0] disabled:cursor-not-allowed"
          >
            {syncing ? 'Saving...' : '↑ Save to OneDrive'}
          </button>
          <button
            onClick={loadLeads}
            disabled={syncing}
            className="text-xs font-semibold px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-all disabled:opacity-40"
          >
            {syncing ? 'Loading...' : '↓ Load from OneDrive'}
          </button>
          {dirty && <span className="text-xs text-yellow-400 ml-1">● Unsaved changes</span>}
          {syncMsg && !dirty && <span className="text-xs text-slate-400 ml-1">{syncMsg}</span>}
          <a href="/signout" className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest">
            Sign Out
          </a>
        </div>

        {error && (
          <div className="mb-6 bg-red-950/40 border border-red-700/40 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {!loaded ? (
          <button
            onClick={search}
            disabled={loading}
            className="bg-[#1a35d0] hover:bg-[#2a4ae0] disabled:opacity-50 text-white font-bold px-8 py-3 rounded-lg transition-all duration-200 uppercase tracking-widest text-sm shadow-[0_0_24px_rgba(26,53,208,0.45)] hover:shadow-[0_0_36px_rgba(26,53,208,0.7)]"
          >
            {loading ? 'Scanning...' : 'Search Firms'}
          </button>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-2 mb-4">
              {(['engineering', 'law'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setFilter('all'); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium tracking-wide transition-all duration-200 border ${
                    tab === t
                      ? 'bg-[#1a35d0] text-white border-[#1a35d0] shadow-[0_0_14px_rgba(26,53,208,0.5)]'
                      : 'bg-[#0f1c2e] text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  {t === 'engineering' ? 'Engineering' : 'Law Firms'}
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${tab === t ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {firms[t].length}
                  </span>
                </button>
              ))}
              <button
                onClick={search}
                disabled={loading}
                className="ml-auto text-xs text-slate-500 hover:text-[#1a35d0] px-3 py-2 rounded-lg border border-transparent hover:border-[#1a35d0]/30 transition-all disabled:opacity-50 uppercase tracking-widest"
              >
                {loading ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {/* Stats bar */}
            <div className="flex gap-3 mb-4">
              <div className="bg-[#0f1c2e] border border-slate-700/50 rounded-lg px-3 py-2 text-center min-w-[72px]">
                <div className="text-lg font-bold text-[#1a35d0]">{stats.contacted}</div>
                <div className="text-xs text-slate-400">Contacted</div>
              </div>
              <div className="bg-[#0f1c2e] border border-slate-700/50 rounded-lg px-3 py-2 text-center min-w-[72px]">
                <div className="text-lg font-bold text-yellow-400">{stats.follow_up}</div>
                <div className="text-xs text-slate-400">Follow Up</div>
              </div>
              <div className="bg-[#0f1c2e] border border-slate-700/50 rounded-lg px-3 py-2 text-center min-w-[72px]">
                <div className="text-lg font-bold text-slate-400">{stats.pass}</div>
                <div className="text-xs text-slate-400">Passed</div>
              </div>
              <div className="bg-[#0f1c2e] border border-slate-700/50 rounded-lg px-3 py-2 text-center min-w-[72px]">
                <div className="text-lg font-bold text-slate-300">{stats.none}</div>
                <div className="text-xs text-slate-400">No Status</div>
              </div>
            </div>

            {/* Status filter */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {FILTER_CONFIG.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 ${
                    filter === key
                      ? 'bg-[#1a35d0] border-[#1a35d0] text-white'
                      : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  {label}
                  {key !== 'all' && (
                    <span className="ml-1.5 opacity-70">
                      {key === 'none' ? stats.none : stats[key as keyof typeof stats]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Firm cards */}
            <div className="space-y-3">
              {filtered.length === 0 && (
                <p className="text-slate-600 text-sm">No results for this filter.</p>
              )}
              {filtered.map((firm) => {
                const lead = getLead(leads, firm.id);
                const overdue = isOverdue(lead.followUpDate);
                const today = isDueToday(lead.followUpDate);

                return (
                  <div
                    key={firm.id}
                    className={`group bg-[#0f1c2e] rounded-xl p-5 flex flex-col gap-3 transition-all duration-200 border ${
                      overdue
                        ? 'border-red-500/50 shadow-[0_0_16px_rgba(239,68,68,0.1)]'
                        : today
                        ? 'border-yellow-500/50 shadow-[0_0_16px_rgba(234,179,8,0.1)]'
                        : 'border-slate-700/70 hover:border-[#1a35d0]/60 hover:shadow-[0_0_24px_rgba(26,53,208,0.15)]'
                    }`}
                  >
                    {/* Top row */}
                    <div className="flex items-start gap-4">
                      <div className={`w-0.5 self-stretch rounded-full transition-all duration-200 shrink-0 ${
                        overdue ? 'bg-red-500' : today ? 'bg-yellow-400' : 'bg-[#1a35d0]/50 group-hover:bg-[#1a35d0]'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="font-bold text-white text-base">{firm.displayName.text}</h2>
                          {lead.followUpDate && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${
                              overdue ? 'bg-red-500/20 text-red-400' : today ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-400'
                            }`}>
                              {overdue ? '⚠ Overdue' : today ? '● Due Today' : `📅 ${lead.followUpDate}`}
                            </span>
                          )}
                        </div>
                        {firm.formattedAddress && (
                          <p className="text-slate-400 text-sm mt-1">{firm.formattedAddress}</p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-2 text-sm">
                          {firm.internationalPhoneNumber && (
                            <a href={`tel:${firm.internationalPhoneNumber}`} className="text-blue-400 hover:text-blue-300 transition-colors">
                              {firm.internationalPhoneNumber}
                            </a>
                          )}
                          {firm.websiteUri && (
                            <a href={firm.websiteUri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">
                              Website →
                            </a>
                          )}
                          {firm.rating && <span className="text-slate-400">★ {firm.rating}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {(Object.entries(STATUS_CONFIG) as [NonNullable<Status>, typeof STATUS_CONFIG[NonNullable<Status>]][]).map(([s, cfg]) => (
                          <button
                            key={s}
                            onClick={() => updateLead(firm.id, { status: lead.status === s ? null : s })}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all duration-150 ${
                              lead.status === s
                                ? cfg.active
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes + follow-up date */}
                    <div className="flex gap-3 pl-5">
                      <textarea
                        value={lead.notes}
                        onChange={e => updateLead(firm.id, { notes: e.target.value })}
                        placeholder="Notes..."
                        rows={2}
                        className="flex-1 bg-[#070b12] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-[#1a35d0]/60 transition-colors"
                      />
                      <div className="flex flex-col justify-center gap-1 shrink-0">
                        <label className="text-xs text-slate-500 uppercase tracking-wide">Follow-up</label>
                        <input
                          type="date"
                          value={lead.followUpDate}
                          onChange={e => updateLead(firm.id, { followUpDate: e.target.value })}
                          className="bg-[#070b12] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-[#1a35d0]/60 transition-colors"
                          style={{ colorScheme: 'dark' }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
