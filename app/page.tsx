'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// ─── Types ───────────────────────────────────────────────────────────────────
type Stage        = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
type Tab          = 'engineering' | 'law' | 'it' | 'architecture' | 'accounting' | 'dental' | 'medical' | 'pt';
type SortKey      = 'name' | 'rating' | 'followup' | 'value' | 'stage';
type View         = 'dashboard' | 'pipeline' | 'leads';
type ActivityType = 'call' | 'email' | 'linkedin' | 'in-person' | 'text' | 'referral' | 'note';

interface Firm {
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
}

interface CRMContact {
  id: string; name: string; title: string;
  email: string; phone: string; linkedIn: string; isPrimary: boolean;
  emailVerified?: boolean;
}

interface Activity {
  id: string; type: ActivityType; date: string; summary: string; outcome: string;
}

interface CRMTask {
  id: string; title: string; dueDate: string; done: boolean;
}

interface LeadData {
  stage: Stage; dealValue: number; probability: number;
  contacts: CRMContact[]; activities: Activity[]; tasks: CRMTask[];
  notes: string; followUpDate: string;
}

type LeadStore = Record<string, LeadData>;
interface LocationSettings { city: string; state: string; radius: number; }

// ─── Config ───────────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<Stage, { label: string; color: string; pill: string; bar: string; border: string; lborder: string }> = {
  new:       { label: 'New',       color: 'text-gray-500',    pill: 'bg-gray-100 text-gray-600',           bar: 'bg-gray-300',     border: 'border-gray-200',    lborder: 'border-l-gray-300' },
  contacted: { label: 'Contacted', color: 'text-blue-600',    pill: 'bg-blue-50 text-blue-700',            bar: 'bg-blue-500',     border: 'border-blue-200',    lborder: 'border-l-blue-500' },
  qualified: { label: 'Qualified', color: 'text-violet-700',  pill: 'bg-violet-50 text-violet-700',        bar: 'bg-violet-500',   border: 'border-violet-200',  lborder: 'border-l-violet-500' },
  proposal:  { label: 'Proposal',  color: 'text-amber-700',   pill: 'bg-amber-50 text-amber-700',          bar: 'bg-amber-500',    border: 'border-amber-200',   lborder: 'border-l-amber-500' },
  won:       { label: 'Won ✓',     color: 'text-emerald-700', pill: 'bg-emerald-50 text-emerald-800',      bar: 'bg-emerald-500',  border: 'border-emerald-200', lborder: 'border-l-emerald-500' },
  lost:      { label: 'Lost',      color: 'text-red-600',     pill: 'bg-red-50 text-red-700',              bar: 'bg-red-400',      border: 'border-red-200',     lborder: 'border-l-red-400' },
};
const STAGES: Stage[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const ACTIVITY_TYPES: ActivityType[] = ['call', 'email', 'linkedin', 'in-person', 'text', 'referral', 'note'];
const ACTIVITY_ICON:  Record<ActivityType, string> = { call:'📞', email:'✉', linkedin:'🔗', 'in-person':'🤝', text:'💬', referral:'⭐', note:'📝' };
const ACTIVITY_LABEL: Record<ActivityType, string> = { call:'Call', email:'Email', linkedin:'LinkedIn', 'in-person':'In-Person', text:'Text', referral:'Referral', note:'Note' };

const TAB_CONFIG: { key: Tab; label: string }[] = [
  { key:'engineering', label:'Engineering' }, { key:'law',         label:'Law Firms'       },
  { key:'it',          label:'IT / Tech'   }, { key:'architecture', label:'Architecture'   },
  { key:'accounting',  label:'Accounting'  }, { key:'dental',       label:'Dental'         },
  { key:'medical',     label:'Medical'     }, { key:'pt',           label:'Physical Therapy'},
];

const SORT_CONFIG: { key: SortKey; label: string }[] = [
  { key:'name', label:'Name' }, { key:'rating', label:'Rating' },
  { key:'value', label:'Value' }, { key:'stage', label:'Stage' }, { key:'followup', label:'Follow-up' },
];

const DEFAULT_LOCATION: LocationSettings = { city: 'Spartanburg', state: 'SC', radius: 50 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid(): string { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function todayStr(): string { return new Date().toISOString().split('T')[0]; }

function defaultLead(): LeadData {
  return { stage:'new', dealValue:0, probability:20, contacts:[], activities:[], tasks:[], notes:'', followUpDate:'' };
}

function getLead(store: LeadStore, id: string): LeadData {
  const v = store[id] as any;
  if (!v) return defaultLead();

  const stageMap: Record<string, Stage> = { contacted:'contacted', follow_up:'qualified', pass:'lost' };

  // Migrate single contact fields → contacts array
  let contacts: CRMContact[] = Array.isArray(v.contacts) ? v.contacts : [];
  if (!contacts.length && (v.contactPerson || v.contactEmail || v.linkedIn)) {
    contacts = [{ id:'legacy', name:v.contactPerson??'', title:'', email:v.contactEmail??'', phone:'', linkedIn:v.linkedIn??'', isPrimary:true }];
  }

  // Migrate contactLog → activities
  let activities: Activity[] = Array.isArray(v.activities) ? v.activities : [];
  if (!activities.length && Array.isArray(v.contactLog) && v.contactLog.length) {
    activities = v.contactLog.map((e: any) => ({
      id: uid(), type: (e.method??'note').toLowerCase().replace(' ','-') as ActivityType,
      date: e.date??todayStr(), summary: e.method??'', outcome:'',
    }));
  }

  return {
    stage:       v.stage       ?? stageMap[v.status??''] ?? 'new',
    dealValue:   v.dealValue   ?? 0,
    probability: v.probability ?? 20,
    contacts, activities,
    tasks:       Array.isArray(v.tasks) ? v.tasks : [],
    notes:       v.notes        ?? '',
    followUpDate:v.followUpDate ?? '',
  };
}

function primaryContact(lead: LeadData): CRMContact | null {
  return lead.contacts.find(c => c.isPrimary) ?? lead.contacts[0] ?? null;
}

function isOverdue(d: string)  { return !!d && new Date(d) < new Date(new Date().toDateString()); }
function isDueToday(d: string) { return !!d && d === todayStr(); }
function isDueWeek(d: string)  {
  if (!d) return false;
  const dt = new Date(d), now = new Date(), w = new Date();
  w.setDate(now.getDate() + 7);
  return dt >= now && dt <= w;
}

function formatCurrency(n: number): string {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
}

function sortFirms(list: Firm[], store: LeadStore, sort: SortKey): Firm[] {
  return [...list].sort((a, b) => {
    const la = getLead(store, a.id), lb = getLead(store, b.id);
    if (sort === 'name')     return a.displayName.text.localeCompare(b.displayName.text);
    if (sort === 'rating')   return (b.rating??0) - (a.rating??0);
    if (sort === 'value')    return lb.dealValue - la.dealValue;
    if (sort === 'stage')    return STAGES.indexOf(la.stage) - STAGES.indexOf(lb.stage);
    if (sort === 'followup') return (la.followUpDate||'9999').localeCompare(lb.followUpDate||'9999');
    return 0;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  const { data: session, status: authStatus } = useSession();

  // View / navigation
  const [view, setView]   = useState<View>('leads');
  const [tab,  setTab]    = useState<Tab>('engineering');
  const [sort, setSort]   = useState<SortKey>('name');
  const [search, setSearch] = useState('');

  // Data
  const [firms, setFirms] = useState<Record<string, Firm[]>>(() => {
    try { return JSON.parse(localStorage.getItem('lf_firms') ?? '{}'); } catch { return {}; }
  });
  const [leads, setLeads] = useState<LeadStore>({});
  const [loaded, setLoaded] = useState(() => {
    try { return !!localStorage.getItem('lf_firms'); } catch { return false; }
  });
  const [location, setLocation] = useState<LocationSettings>(() => {
    try { return JSON.parse(localStorage.getItem('lf_location') ?? 'null') ?? DEFAULT_LOCATION; } catch { return DEFAULT_LOCATION; }
  });
  const [locationDraft, setLocationDraft] = useState<LocationSettings>(() => {
    try { return JSON.parse(localStorage.getItem('lf_location') ?? 'null') ?? DEFAULT_LOCATION; } catch { return DEFAULT_LOCATION; }
  });

  // Sync
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [dirty, setDirty]       = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<string | null>(null);
  const [showLocation, setShowLocation] = useState(false);

  // Card expand
  const [expandedFirm, setExpandedFirm] = useState<string | null>(null);

  // Activity log form
  const [activityOpen,     setActivityOpen]     = useState<string | null>(null);
  const [activityType,     setActivityType]     = useState<ActivityType>('call');
  const [activityDate,     setActivityDate]     = useState(todayStr());
  const [activitySummary,  setActivitySummary]  = useState('');
  const [activityOutcome,  setActivityOutcome]  = useState('');

  // Task form
  const [taskOpen,    setTaskOpen]    = useState<string | null>(null);
  const [taskTitle,   setTaskTitle]   = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  // AI tools
  const [scriptOpen,    setScriptOpen]    = useState<string | null>(null);
  const [scriptType,    setScriptType]    = useState<'call' | 'email' | 'linkedin'>('call');
  const [scriptText,    setScriptText]    = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);
  const [emailSubject,  setEmailSubject]  = useState('');
  const [emailBody,     setEmailBody]     = useState('');

  // Chat refinement
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Enrichment
  const [enriching, setEnriching] = useState<string | null>(null);
  const [findingEmail, setFindingEmail] = useState<string | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => { if (session) loadLeads(); }, [session]);

  useEffect(() => {
    if (!dirty || !session) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveLeads, 2500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [leads, dirty]);

  // ─── API calls ──────────────────────────────────────────────────────────────
  const loadLeads = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch('/api/statuses');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLeads(data); setDirty(false); setSyncMsg('Loaded from OneDrive');
    } catch (e) { setSyncMsg(`Load failed: ${String(e)}`); }
    finally { setSyncing(false); }
  };

  const saveLeads = useCallback(async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch('/api/statuses', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(leads) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDirty(false); setSyncMsg('Saved to OneDrive');
    } catch (e) { setSyncMsg(`Save failed: ${String(e)}`); }
    finally { setSyncing(false); }
  }, [leads]);

  const updateLead = (id: string, updates: Partial<LeadData>) => {
    setLeads(prev => ({ ...prev, [id]: { ...defaultLead(), ...getLead(prev, id), ...updates } }));
    setDirty(true); setSyncMsg(null);
  };

  const search_ = async (loc: LocationSettings = location) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ city: loc.city, state: loc.state, radius: String(loc.radius) });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFirms(data); setLoaded(true); setLocation(loc);
      localStorage.setItem('lf_firms', JSON.stringify(data));
      localStorage.setItem('lf_location', JSON.stringify(loc));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  const enrichContact = async (firm: Firm) => {
    setEnriching(firm.id);
    try {
      const res = await fetch('/api/enrich', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ firmName: firm.displayName.text, website: firm.websiteUri, address: firm.formattedAddress }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      const lead = getLead(leads, firm.id);
      const contacts = lead.contacts.length ? [...lead.contacts] : [];
      // Update or create primary contact with enriched data
      const primaryIdx = contacts.findIndex(c => c.isPrimary);
      if (primaryIdx >= 0) {
        if (data.contactEmail)  contacts[primaryIdx] = { ...contacts[primaryIdx], email: data.contactEmail };
        if (data.contactPerson) contacts[primaryIdx] = { ...contacts[primaryIdx], name: data.contactPerson };
        if (data.linkedIn)      contacts[primaryIdx] = { ...contacts[primaryIdx], linkedIn: data.linkedIn };
      } else if (data.contactEmail || data.contactPerson) {
        contacts.push({ id: uid(), name: data.contactPerson??'', title:'', email: data.contactEmail??'', phone:'', linkedIn: data.linkedIn??'', isPrimary: true });
      }
      updateLead(firm.id, { contacts });
    } catch (e) { alert('Enrichment failed: ' + String(e)); }
    finally { setEnriching(null); }
  };

  const findVerifiedEmail = async (firm: Firm) => {
    setFindingEmail(firm.id);
    try {
      const res = await fetch('/api/find-coo-email', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ firmName: firm.displayName.text, website: firm.websiteUri, address: firm.formattedAddress }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (!data.email) { alert(data.message ?? 'No email could be found.'); return; }
      if (!data.verified) {
        alert(`Guessed ${data.contactPerson ? `${data.contactPerson} — ` : ''}${data.email}, but it could not be verified as deliverable (status: ${data.status}). Not auto-filled — add it manually if you want to use it.`);
        return;
      }
      const lead = getLead(leads, firm.id);
      const contacts = lead.contacts.length ? [...lead.contacts] : [];
      const primaryIdx = contacts.findIndex(c => c.isPrimary);
      const contactPatch = { email: data.email, emailVerified: true, ...(data.contactPerson ? { name: data.contactPerson } : {}), ...(data.title ? { title: data.title } : {}) };
      if (primaryIdx >= 0) {
        contacts[primaryIdx] = { ...contacts[primaryIdx], ...contactPatch };
      } else {
        contacts.push({ id: uid(), name: data.contactPerson ?? '', title: data.title ?? '', email: data.email, phone: '', linkedIn: '', isPrimary: true, emailVerified: true });
      }
      updateLead(firm.id, { contacts });
    } catch (e) { alert('Email lookup failed: ' + String(e)); }
    finally { setFindingEmail(null); }
  };

  const generateScript = async (firm: Firm, type: 'call' | 'email' | 'linkedin') => {
    const lead = getLead(leads, firm.id);
    const pc = primaryContact(lead);
    setScriptOpen(firm.id); setScriptType(type); setScriptText(''); setScriptLoading(true);
    if (type !== 'call') { setChatHistory([]); setEmailSubject(''); setEmailBody(''); }
    try {
      const res = await fetch('/api/script', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ firmName: firm.displayName.text, address: firm.formattedAddress, phone: firm.internationalPhoneNumber, website: firm.websiteUri, tab, type, contactPerson: pc?.name, notes: lead.notes }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScriptText(data.text);
      if (type === 'email') {
        const lines = data.text.split('\n');
        const subjectLine = lines.find((l: string) => l.startsWith('Subject:')) ?? '';
        setEmailSubject(subjectLine.replace(/^Subject:\s*/, '').trim());
        setEmailBody(data.text.replace(/^Subject:.*\n?/, '').trim());
      }
    } catch (e) { setScriptText(`Error: ${String(e)}`); }
    finally { setScriptLoading(false); }
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const newHistory = [...chatHistory, { role:'user' as const, content: msg }];
    setChatHistory(newHistory); setChatInput(''); setChatLoading(true);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50);
    try {
      const res = await fetch('/api/chat-email', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subject: emailSubject, body: emailBody, history: chatHistory, message: msg }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.type === 'update') { setEmailSubject(data.subject); setEmailBody(data.body); }
      setChatHistory(h => [...h, { role:'assistant', content: data.reply }]);
    } catch (e) { setChatHistory(h => [...h, { role:'assistant', content: `Error: ${String(e)}` }]); }
    finally { setChatLoading(false); setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50); }
  };

  const openInOutlook = (toEmail?: string) => {
    const to = toEmail ? encodeURIComponent(toEmail) : '';
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  };

  const logActivity = (firmId: string) => {
    if (!activitySummary.trim()) return;
    const entry: Activity = { id: uid(), type: activityType, date: activityDate, summary: activitySummary.trim(), outcome: activityOutcome.trim() };
    const lead = getLead(leads, firmId);
    updateLead(firmId, { activities: [entry, ...lead.activities] });
    setActivityOpen(null); setActivitySummary(''); setActivityOutcome(''); setActivityDate(todayStr());
  };

  const addTask = (firmId: string) => {
    if (!taskTitle.trim()) return;
    const task: CRMTask = { id: uid(), title: taskTitle.trim(), dueDate: taskDueDate, done: false };
    const lead = getLead(leads, firmId);
    updateLead(firmId, { tasks: [...lead.tasks, task] });
    setTaskOpen(null); setTaskTitle(''); setTaskDueDate('');
  };

  const toggleTask = (firmId: string, taskId: string) => {
    const lead = getLead(leads, firmId);
    updateLead(firmId, { tasks: lead.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) });
  };

  const removeTask = (firmId: string, taskId: string) => {
    const lead = getLead(leads, firmId);
    updateLead(firmId, { tasks: lead.tasks.filter(t => t.id !== taskId) });
  };

  // ─── Computed ────────────────────────────────────────────────────────────────
  const allFirms: (Firm & { tab: Tab })[] = Object.entries(firms).flatMap(([t, list]) =>
    (list as Firm[]).map(f => ({ ...f, tab: t as Tab }))
  );

  // All tasks across all firms due this week (for dashboard)
  const allTasksDueWeek = allFirms.flatMap(f => {
    const lead = getLead(leads, f.id);
    return lead.tasks.filter(t => !t.done && (isDueToday(t.dueDate) || isDueWeek(t.dueDate))).map(t => ({ ...t, firm: f }));
  }).sort((a, b) => (a.dueDate||'9999').localeCompare(b.dueDate||'9999'));

  // Recent activities across all firms (last 10)
  const recentActivities = allFirms.flatMap(f => {
    const lead = getLead(leads, f.id);
    return lead.activities.map(a => ({ ...a, firm: f }));
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  // Pipeline stats across ALL firms
  const pipelineStats = STAGES.reduce((acc, s) => {
    const firms_ = allFirms.filter(f => getLead(leads, f.id).stage === s);
    acc[s] = { count: firms_.length, value: firms_.reduce((sum, f) => sum + getLead(leads, f.id).dealValue, 0) };
    return acc;
  }, {} as Record<Stage, { count: number; value: number }>);

  const totalPipeline  = Object.entries(pipelineStats).filter(([s]) => s !== 'lost' && s !== 'new').reduce((sum, [,v]) => sum + v.value, 0);
  const weightedPipeline = allFirms.filter(f => !['lost','new'].includes(getLead(leads,f.id).stage)).reduce((sum, f) => {
    const l = getLead(leads, f.id);
    return sum + l.dealValue * (l.probability / 100);
  }, 0);
  const wonValue = pipelineStats['won']?.value ?? 0;
  const totalDeals = allFirms.filter(f => !['new','lost'].includes(getLead(leads,f.id).stage)).length;
  const wonCount = pipelineStats['won']?.count ?? 0;
  const lostCount = pipelineStats['lost']?.count ?? 0;
  const winRate = (wonCount + lostCount) > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;

  // Leads view filtered list
  const currentFirms: Firm[] = firms[tab] ?? [];
  const filteredFirms = sortFirms(
    currentFirms.filter(f => {
      if (!search) return true;
      return f.displayName.text.toLowerCase().includes(search.toLowerCase()) ||
             (f.formattedAddress ?? '').toLowerCase().includes(search.toLowerCase());
    }),
    leads, sort
  );

  // ─── Auth screens ────────────────────────────────────────────────────────────
  if (authStatus === 'loading') {
    return <main className="min-h-screen flex items-center justify-center bg-[#eef3fb]"><div className="text-gray-600 tracking-widest uppercase text-sm font-semibold animate-pulse">Loading...</div></main>;
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0047c8 0%, #0057e7 50%, #0069ff 100%)' }}>
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl px-12 py-10 flex flex-col items-center shadow-[0_8px_48px_rgba(0,0,0,0.3)]">
          <img src="/logo.png" alt="Cirrobound" className="h-24 w-auto mb-6" style={{ mixBlendMode: 'screen' }} />
          <h1 className="text-white font-bold text-2xl tracking-widest uppercase mb-1">Lead Finder</h1>
          <p className="text-blue-100/70 text-sm mb-8 tracking-wide">Cirrobound Solutions</p>
          <a href="/signin" className="flex items-center gap-3 bg-white text-[#0057e7] font-bold px-8 py-3.5 rounded-xl text-sm tracking-wide shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.3)] hover:scale-[1.02] transition-all">
            <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
            Sign in with Microsoft
          </a>
          <p className="text-blue-100/40 text-xs mt-6">Use your @cirrobound.com account</p>
        </div>
      </main>
    );
  }

  // ─── Shared UI pieces ─────────────────────────────────────────────────────────
  const INPUT = 'bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 transition-colors w-full';
  const BTN_GHOST = 'text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-all bg-white';
  const BTN_PRIMARY = 'text-xs bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3 py-1.5 rounded-lg transition-all font-medium';

  // Stage selector dropdown for a firm
  const StageSelector = ({ firmId, stage }: { firmId: string; stage: Stage }) => (
    <select
      value={stage}
      onChange={e => updateLead(firmId, { stage: e.target.value as Stage })}
      className={`text-xs font-semibold px-2 py-1 rounded border cursor-pointer outline-none transition-all ${STAGE_CONFIG[stage].pill} ${STAGE_CONFIG[stage].border} bg-transparent`}
    >
      {STAGES.map(s => <option key={s} value={s} className="bg-white text-gray-800">{STAGE_CONFIG[s].label}</option>)}
    </select>
  );

  // ─── Dashboard View ────────────────────────────────────────────────────────────
  const DashboardView = () => (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:'Weighted Pipeline', value: `$${Math.round(weightedPipeline / 1000)}k`, sub:'probability-adjusted', color:'text-blue-600' },
          { label:'Total Pipeline',    value: formatCurrency(totalPipeline),              sub:`${totalDeals} active deals`,  color:'text-violet-600' },
          { label:'Closed Won',        value: formatCurrency(wonValue),                   sub:`${wonCount} deals won`,        color:'text-emerald-600' },
          { label:'Win Rate',          value: `${winRate}%`,                              sub:`${wonCount}W / ${lostCount}L`, color:'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-blue-100 rounded-xl shadow-[0_2px_12px_rgba(0,87,231,0.08)] p-4">
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-700 font-semibold mt-0.5">{k.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Pipeline by stage */}
      <div className="bg-white border border-blue-100 rounded-xl shadow-[0_2px_12px_rgba(0,87,231,0.08)] p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Pipeline by Stage</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {STAGES.map(s => (
            <div key={s} className={`rounded-lg p-3 border-l-4 ${STAGE_CONFIG[s].lborder} border border-slate-200 bg-white shadow-sm text-center`}>
              <div className={`text-xl font-bold ${STAGE_CONFIG[s].color}`}>{pipelineStats[s]?.count ?? 0}</div>
              <div className="text-xs text-gray-600 mt-0.5">{STAGE_CONFIG[s].label}</div>
              {(pipelineStats[s]?.value ?? 0) > 0 && (
                <div className={`text-xs font-medium mt-1 ${STAGE_CONFIG[s].color}`}>{formatCurrency(pipelineStats[s].value)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tasks + Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tasks due this week */}
        <div className="bg-white border border-blue-100 rounded-xl shadow-[0_2px_12px_rgba(0,87,231,0.08)] p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Tasks Due This Week</h3>
          {allTasksDueWeek.length === 0 ? (
            <p className="text-gray-500 text-sm">No tasks due this week.</p>
          ) : (
            <div className="space-y-2">
              {allTasksDueWeek.map(t => (
                <div key={t.id} className="flex items-start gap-2">
                  <button onClick={() => toggleTask(t.firm.id, t.id)} className="mt-0.5 shrink-0 w-4 h-4 rounded border border-gray-300 hover:border-emerald-500 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 font-medium">{t.title}</div>
                    <div className="text-xs text-gray-500">{t.firm.displayName.text}</div>
                  </div>
                  {t.dueDate && (
                    <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-medium ${isDueToday(t.dueDate) ? 'bg-yellow-100 text-yellow-700' : isOverdue(t.dueDate) ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                      {isDueToday(t.dueDate) ? 'Today' : isOverdue(t.dueDate) ? 'Overdue' : t.dueDate}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white border border-blue-100 rounded-xl shadow-[0_2px_12px_rgba(0,87,231,0.08)] p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Recent Activity</h3>
          {recentActivities.length === 0 ? (
            <p className="text-gray-500 text-sm">No activity logged yet.</p>
          ) : (
            <div className="space-y-2">
              {recentActivities.map(a => (
                <div key={a.id} className="flex items-start gap-2">
                  <span className="text-base shrink-0 mt-0.5">{ACTIVITY_ICON[a.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate font-medium">{a.summary || ACTIVITY_LABEL[a.type]}</div>
                    <div className="text-xs text-gray-500">{a.firm.displayName.text} · {a.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Pipeline / Kanban View ────────────────────────────────────────────────────
  const PipelineView = () => (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {STAGES.map(stage => {
          const stageFirms = allFirms.filter(f => getLead(leads, f.id).stage === stage);
          const stageValue = stageFirms.reduce((sum, f) => sum + getLead(leads, f.id).dealValue, 0);
          return (
            <div key={stage} className="w-60 flex flex-col gap-2">
              {/* Column header */}
              <div className={`rounded-lg px-3 py-2.5 border-l-4 ${STAGE_CONFIG[stage].lborder} bg-white shadow-sm flex items-center justify-between`}>
                <span className={`text-xs font-bold uppercase tracking-wide ${STAGE_CONFIG[stage].color}`}>{STAGE_CONFIG[stage].label}</span>
                <div className="flex items-center gap-1.5">
                  {stageValue > 0 && <span className={`text-xs font-medium ${STAGE_CONFIG[stage].color}`}>{formatCurrency(stageValue)}</span>}
                  <span className="text-xs text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{stageFirms.length}</span>
                </div>
              </div>
              {/* Cards */}
              <div className="space-y-2">
                {stageFirms.map(f => {
                  const lead = getLead(leads, f.id);
                  const pc   = primaryContact(lead);
                  return (
                    <div key={f.id} className={`bg-white border-l-4 ${STAGE_CONFIG[stage].lborder} border border-slate-200 rounded-lg p-3 flex flex-col gap-1.5 shadow-sm`}>
                      <div className="text-sm font-semibold text-gray-900 leading-tight">{f.displayName.text}</div>
                      <div className="text-xs text-gray-500 font-medium">{TAB_CONFIG.find(t => t.key === f.tab)?.label}</div>
                      {pc?.name && <div className="text-xs text-gray-600">{pc.name}</div>}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        {lead.dealValue > 0
                          ? <span className={`text-xs font-bold ${STAGE_CONFIG[stage].color}`}>{formatCurrency(lead.dealValue)}</span>
                          : <span />
                        }
                        <button
                          onClick={() => { setView('leads'); setTab(f.tab); setExpandedFirm(f.id); setTimeout(() => document.getElementById(`firm-${f.id}`)?.scrollIntoView({ behavior:'smooth', block:'center' }), 100); }}
                          className="text-xs text-[#0057e7] font-semibold hover:text-blue-800 transition-colors"
                        >
                          View →
                        </button>
                      </div>
                      {/* Quick stage move */}
                      <select
                        value={stage}
                        onChange={e => updateLead(f.id, { stage: e.target.value as Stage })}
                        className="text-xs bg-white border border-gray-200 text-gray-700 rounded px-1.5 py-0.5 outline-none w-full focus:border-[#2563eb]"
                      >
                        {STAGES.map(s => <option key={s} value={s} className="bg-slate-50">{STAGE_CONFIG[s].label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── Leads View ───────────────────────────────────────────────────────────────
  const LeadsView = () => (
    <>
      {/* Industry tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TAB_CONFIG.map(({ key, label }) => (
          <button key={key} onClick={() => { setTab(key); setExpandedFirm(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium tracking-wide transition-all border ${
              tab === key ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-sm'
                         : 'bg-white text-gray-600 border-gray-200 hover:border-[#2563eb] hover:text-[#2563eb]'
            }`}
          >
            {label}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${tab === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {(firms[key] ?? []).length}
            </span>
          </button>
        ))}
        <button onClick={() => search_()} disabled={loading}
          className="ml-auto text-xs text-gray-500 hover:text-[#2563eb] px-3 py-2 rounded-lg border border-transparent hover:border-[#2563eb]/30 transition-all disabled:opacity-50 uppercase tracking-widest">
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search firms..."
          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2563eb] w-48"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Sort:</span>
          {SORT_CONFIG.map(({ key, label }) => (
            <button key={key} onClick={() => setSort(key)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${sort === key ? 'bg-[#2563eb] border-[#2563eb] text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-[#2563eb] hover:text-[#2563eb]'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Firm cards */}
      <div className="space-y-2">
        {filteredFirms.length === 0 && <p className="text-gray-900 text-sm">No firms found.</p>}
        {filteredFirms.map(firm => {
          const lead    = getLead(leads, firm.id);
          const pc      = primaryContact(lead);
          const expanded = expandedFirm === firm.id;
          const overdue  = isOverdue(lead.followUpDate);
          const dueToday = isDueToday(lead.followUpDate);
          const pendingTasks = lead.tasks.filter(t => !t.done).length;

          return (
            <div key={firm.id} id={`firm-${firm.id}`}
              className={`rounded-xl border-l-4 overflow-hidden transition-all duration-200 ${STAGE_CONFIG[lead.stage].lborder} ${
                overdue  ? 'border border-red-200 shadow-[0_2px_16px_rgba(239,68,68,0.12)]' :
                dueToday ? 'border border-yellow-200 shadow-[0_2px_16px_rgba(234,179,8,0.12)]' :
                expanded ? 'border border-blue-200 shadow-[0_6px_24px_rgba(0,87,231,0.18)]' :
                           'border border-blue-100 shadow-[0_2px_12px_rgba(0,87,231,0.07)] hover:border-blue-200 hover:shadow-[0_4px_20px_rgba(0,87,231,0.13)]'
              }`}
              style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f4f8ff 100%)' }}
            >
              {/* ── Card (always visible) ── */}
              <div className="px-5 py-4 cursor-pointer" onClick={() => setExpandedFirm(expanded ? null : firm.id)}>

                {/* Row 1: name + stage + right-side actions */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-gray-900 text-base leading-tight">{firm.displayName.text}</span>
                    <select
                      value={lead.stage}
                      onChange={e => updateLead(firm.id, { stage: e.target.value as Stage })}
                      onClick={e => e.stopPropagation()}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-pointer outline-none transition-all ${STAGE_CONFIG[lead.stage].pill} ${STAGE_CONFIG[lead.stage].border} bg-transparent`}
                    >
                      {STAGES.map(s => <option key={s} value={s} className="bg-white text-gray-800">{STAGE_CONFIG[s].label}</option>)}
                    </select>
                    {lead.dealValue > 0 && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md bg-blue-50 ${STAGE_CONFIG[lead.stage].color}`}>
                        {formatCurrency(lead.dealValue)}
                      </span>
                    )}
                    {overdue  && <span className="text-xs bg-red-100 text-red-500 font-medium px-2 py-0.5 rounded-md">⚠ Overdue</span>}
                    {dueToday && !overdue && <span className="text-xs bg-yellow-100 text-yellow-600 font-medium px-2 py-0.5 rounded-md">● Due Today</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {firm.internationalPhoneNumber && (
                      <a href={`tel:${firm.internationalPhoneNumber}`} onClick={e => e.stopPropagation()}
                        className="text-xs text-[#0057e7] hover:text-blue-800 font-medium">{firm.internationalPhoneNumber}</a>
                    )}
                    {firm.websiteUri && (
                      <a href={firm.websiteUri} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-xs text-[#0057e7] hover:text-blue-800 font-medium">Website →</a>
                    )}
                    <span className={`text-xs font-bold transition-colors ${expanded ? 'text-[#0057e7]' : 'text-gray-300'}`}>{expanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Row 2: contact pill + last activity + next task */}
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                  {pc?.name && (
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-[#0057e7] flex items-center justify-center text-[9px] font-bold shrink-0">
                        {pc.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-gray-700">{pc.name}</span>
                      {pc.title && <span className="text-gray-500">· {pc.title}</span>}
                      {pc.email && <span className="text-gray-500">· {pc.email}</span>}
                    </span>
                  )}
                  {lead.activities.length > 0 && (() => {
                    const last = lead.activities[0];
                    return (
                      <span className="text-gray-500">
                        {ACTIVITY_ICON[last.type]} <span className="text-gray-600">{last.summary || ACTIVITY_LABEL[last.type]}</span>
                        <span className="text-gray-500"> · {last.date}</span>
                      </span>
                    );
                  })()}
                  {(() => {
                    const next = lead.tasks.filter(t => !t.done).sort((a,b) => (a.dueDate||'9999').localeCompare(b.dueDate||'9999'))[0];
                    if (!next) return null;
                    return (
                      <span className={isDueToday(next.dueDate) ? 'text-yellow-600' : isOverdue(next.dueDate) ? 'text-red-500' : 'text-gray-500'}>
                        ✓ <span className="font-medium">{next.title}</span>
                        {next.dueDate && <span className="text-gray-500"> · {next.dueDate}</span>}
                      </span>
                    );
                  })()}
                  {lead.tasks.filter(t=>!t.done).length === 0 && lead.followUpDate && (
                    <span className={overdue ? 'text-red-500' : dueToday ? 'text-yellow-600' : 'text-gray-500'}>
                      📅 <span className="font-medium">{lead.followUpDate}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* ── Expanded body ── */}
              {expanded && (
                <div className="flex flex-col gap-0 border-t-2 border-blue-100" style={{ background: 'linear-gradient(180deg, #eef3fb 0%, #f4f8ff 100%)' }}>

                  {/* Deal info row */}
                  <div className="px-5 pt-4 pb-4 border-b border-blue-100/60">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-1.5 h-4 rounded-full bg-[#0057e7] shrink-0" />
                      <span className="text-xs font-bold text-[#0057e7] uppercase tracking-widest">Deal Info</span>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Deal Value</label>
                        <input type="number" value={lead.dealValue || ''} onChange={e => updateLead(firm.id, { dealValue: Number(e.target.value) })}
                          placeholder="0" className={`${INPUT} w-32`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Probability %</label>
                        <input type="number" value={lead.probability} onChange={e => updateLead(firm.id, { probability: Math.min(100, Math.max(0, Number(e.target.value))) })}
                          min={0} max={100} className={`${INPUT} w-24`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Follow-up Date</label>
                        <input type="date" value={lead.followUpDate} onChange={e => updateLead(firm.id, { followUpDate: e.target.value })}
                          className={`${INPUT} w-40`} style={{ colorScheme:'light' }} />
                      </div>
                    </div>
                  </div>

                  {/* Contacts */}
                  <div className="px-5 pt-4 pb-4 border-b border-blue-100/60">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-4 rounded-full bg-[#0057e7] shrink-0" />
                        <label className="text-xs font-bold text-[#0057e7] uppercase tracking-widest">Contacts</label>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => enrichContact(firm)} disabled={enriching === firm.id}
                          className={`${BTN_GHOST} hover:text-emerald-400 hover:border-emerald-500/50 disabled:opacity-50`}>
                          {enriching === firm.id ? '🔍 Searching…' : '🔍 Find Contact'}
                        </button>
                        <button onClick={() => findVerifiedEmail(firm)} disabled={findingEmail === firm.id}
                          title="Guess the COO's email from the company domain and verify it's deliverable before filling it in"
                          className={`${BTN_GHOST} hover:text-emerald-400 hover:border-emerald-500/50 disabled:opacity-50`}>
                          {findingEmail === firm.id ? '🎯 Verifying…' : '🎯 Find & Verify COO Email'}
                        </button>
                        <button onClick={() => {
                          const lead_ = getLead(leads, firm.id);
                          const newContact = { id: uid(), name:'', title:'', email:'', phone:'', linkedIn:'', isPrimary: lead_.contacts.length === 0 };
                          updateLead(firm.id, { contacts: [...lead_.contacts, newContact] });
                        }} className={BTN_GHOST}>+ Add Contact</button>
                      </div>
                    </div>
                    {lead.contacts.length === 0
                      ? <p className="text-xs text-gray-500 italic">No contacts yet — use Find Contact or add one manually.</p>
                      : (
                        <div className="space-y-2">
                          {lead.contacts.map((c, ci) => (
                            <div key={c.id} className="bg-white border border-blue-100 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                <input value={c.name} onChange={e => { const cs = [...lead.contacts]; cs[ci] = { ...cs[ci], name: e.target.value }; updateLead(firm.id, { contacts: cs }); }}
                                  placeholder="Full name" className="bg-transparent border-b border-blue-100 text-sm font-semibold text-gray-900 placeholder-gray-300 outline-none pb-0.5 flex-1 min-w-32 focus:border-[#0057e7]" />
                                <input value={c.title} onChange={e => { const cs = [...lead.contacts]; cs[ci] = { ...cs[ci], title: e.target.value }; updateLead(firm.id, { contacts: cs }); }}
                                  placeholder="Title / Role" className="bg-transparent border-b border-blue-100 text-sm text-gray-500 placeholder-gray-300 outline-none pb-0.5 flex-1 min-w-28 focus:border-[#0057e7]" />
                                {!c.isPrimary && (
                                  <button onClick={() => { const cs = lead.contacts.map((x, i) => ({ ...x, isPrimary: i === ci })); updateLead(firm.id, { contacts: cs }); }}
                                    className="text-xs text-blue-400 hover:text-[#0057e7] transition-colors">Set Primary</button>
                                )}
                                {c.isPrimary && <span className="text-xs bg-blue-50 text-[#0057e7] border border-blue-200 px-2 py-0.5 rounded-full font-medium">Primary</span>}
                                <button onClick={() => { const cs = lead.contacts.filter((_, i) => i !== ci); updateLead(firm.id, { contacts: cs }); }}
                                  className="text-xs text-gray-300 hover:text-red-500 transition-colors">✕</button>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <input value={c.email} onChange={e => { const cs = [...lead.contacts]; cs[ci] = { ...cs[ci], email: e.target.value, emailVerified: false }; updateLead(firm.id, { contacts: cs }); }}
                                  placeholder="email@company.com" type="email"
                                  className="bg-[#f8faff] border border-blue-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 placeholder-gray-300 outline-none focus:border-[#0057e7] flex-1 min-w-36" />
                                {c.emailVerified && c.email && (
                                  <span title="Verified deliverable via Hunter.io" className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg font-medium self-center">✓ Verified</span>
                                )}
                                <input value={c.phone} onChange={e => { const cs = [...lead.contacts]; cs[ci] = { ...cs[ci], phone: e.target.value }; updateLead(firm.id, { contacts: cs }); }}
                                  placeholder="Phone" type="tel"
                                  className="bg-[#f8faff] border border-blue-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 placeholder-gray-300 outline-none focus:border-[#0057e7] w-36" />
                                <input value={c.linkedIn} onChange={e => { const cs = [...lead.contacts]; cs[ci] = { ...cs[ci], linkedIn: e.target.value }; updateLead(firm.id, { contacts: cs }); }}
                                  placeholder="LinkedIn URL" type="url"
                                  className="bg-[#f8faff] border border-blue-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 placeholder-gray-300 outline-none focus:border-[#0057e7] flex-1 min-w-36" />
                                {c.linkedIn && <a href={c.linkedIn} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0057e7] hover:underline self-center">🔗 LinkedIn</a>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>

                  {/* Activity Timeline */}
                  <div className="px-5 pt-4 pb-4 border-b border-blue-100/60">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-4 rounded-full bg-violet-500 shrink-0" />
                        <label className="text-xs font-bold text-violet-600 uppercase tracking-widest">Activity Timeline</label>
                      </div>
                      {activityOpen !== firm.id && (
                        <button onClick={() => { setActivityOpen(firm.id); setActivityDate(todayStr()); }} className={BTN_GHOST}>+ Log Activity</button>
                      )}
                    </div>

                    {activityOpen === firm.id && (
                      <div className="bg-white border border-blue-100 rounded-xl p-3 mb-3 flex flex-col gap-2 shadow-sm">
                        <div className="flex gap-1.5 flex-wrap">
                          {ACTIVITY_TYPES.map(t => (
                            <button key={t} onClick={() => setActivityType(t)}
                              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium ${activityType === t ? 'bg-[#0057e7] border-[#0057e7] text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-[#0057e7] hover:text-[#0057e7]'}`}>
                              {ACTIVITY_ICON[t]} {ACTIVITY_LABEL[t]}
                            </button>
                          ))}
                        </div>
                        <input type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)} className={`${INPUT} w-40`} style={{ colorScheme:'light' }} />
                        <input value={activitySummary} onChange={e => setActivitySummary(e.target.value)} placeholder="What happened?" className={INPUT} />
                        <input value={activityOutcome} onChange={e => setActivityOutcome(e.target.value)} placeholder="Outcome / next step (optional)" className={INPUT} />
                        <div className="flex gap-2">
                          <button onClick={() => logActivity(firm.id)} className={BTN_PRIMARY}>Save</button>
                          <button onClick={() => { setActivityOpen(null); setActivitySummary(''); setActivityOutcome(''); }} className={BTN_GHOST}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {lead.activities.length === 0
                      ? <p className="text-xs text-gray-500 italic">No activity logged yet.</p>
                      : (
                        <div className="space-y-2">
                          {lead.activities.map((a, ai) => (
                            <div key={a.id} className="flex items-start gap-3 group bg-white border border-blue-50 rounded-xl px-3 py-2.5 shadow-sm">
                              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 text-sm">{ACTIVITY_ICON[a.type]}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-gray-800">{ACTIVITY_LABEL[a.type]}</span>
                                  <span className="text-xs text-gray-500">{a.date}</span>
                                </div>
                                <div className="text-sm text-gray-800 mt-0.5">{a.summary}</div>
                                {a.outcome && <div className="text-xs text-blue-500 mt-0.5">→ {a.outcome}</div>}
                              </div>
                              <button onClick={() => updateLead(firm.id, { activities: lead.activities.filter((_, i) => i !== ai) })}
                                className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-1">✕</button>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>

                  {/* Tasks */}
                  <div className="px-5 pt-4 pb-4 border-b border-blue-100/60">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-4 rounded-full bg-emerald-500 shrink-0" />
                        <label className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Tasks</label>
                      </div>
                      {taskOpen !== firm.id && (
                        <button onClick={() => setTaskOpen(firm.id)} className={BTN_GHOST}>+ Add Task</button>
                      )}
                    </div>

                    {taskOpen === firm.id && (
                      <div className="bg-white border border-blue-100 rounded-xl p-3 mb-3 flex flex-col gap-2 shadow-sm">
                        <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title" className={INPUT} />
                        <div className="flex gap-2 items-center">
                          <input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} className={`${INPUT} w-40`} style={{ colorScheme:'light' }} />
                          <button onClick={() => addTask(firm.id)} className={BTN_PRIMARY}>Add</button>
                          <button onClick={() => { setTaskOpen(null); setTaskTitle(''); setTaskDueDate(''); }} className={BTN_GHOST}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {lead.tasks.length > 0 && (
                      <div className="space-y-1.5">
                        {lead.tasks.map(t => (
                          <div key={t.id} className="flex items-center gap-3 group bg-white border border-blue-50 rounded-xl px-3 py-2.5 shadow-sm">
                            <button onClick={() => toggleTask(firm.id, t.id)}
                              className={`shrink-0 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center text-xs ${t.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400'}`}>
                              {t.done && '✓'}
                            </button>
                            <span className={`text-sm flex-1 ${t.done ? 'line-through text-gray-400' : 'text-gray-800 font-medium'}`}>{t.title}</span>
                            {t.dueDate && !t.done && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${isDueToday(t.dueDate) ? 'bg-yellow-100 text-yellow-700' : isOverdue(t.dueDate) ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-700'}`}>
                                {t.dueDate}
                              </span>
                            )}
                            <button onClick={() => removeTask(firm.id, t.id)} className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-all shrink-0">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="px-5 pt-4 pb-4 border-b border-blue-100/60">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-1.5 h-4 rounded-full bg-amber-500 shrink-0" />
                      <label className="text-xs font-bold text-amber-600 uppercase tracking-widest">Notes</label>
                    </div>
                    <textarea value={lead.notes} onChange={e => updateLead(firm.id, { notes: e.target.value })}
                      placeholder="Notes about this firm..." rows={3}
                      className="w-full bg-white border border-blue-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:border-[#0057e7] transition-colors shadow-sm" />
                  </div>

                  {/* AI Tools */}
                  <div className="px-5 pt-4 pb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-1.5 h-4 rounded-full bg-[#0057e7] shrink-0" />
                      <label className="text-xs font-bold text-[#0057e7] uppercase tracking-widest">AI Outreach</label>
                    </div>
                    {scriptOpen !== firm.id ? (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => generateScript(firm, 'call')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-blue-100 hover:border-[#0057e7] hover:bg-blue-50 text-gray-700 hover:text-[#0057e7] rounded-xl text-xs font-medium transition-all shadow-sm">📞 Call Script</button>
                        <button onClick={() => generateScript(firm, 'email')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-blue-100 hover:border-[#0057e7] hover:bg-blue-50 text-gray-700 hover:text-[#0057e7] rounded-xl text-xs font-medium transition-all shadow-sm">✉ Email Template</button>
                        <button onClick={() => generateScript(firm, 'linkedin')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-blue-100 hover:border-[#0057e7] hover:bg-blue-50 text-gray-700 hover:text-[#0057e7] rounded-xl text-xs font-medium transition-all shadow-sm">🔗 LinkedIn Message</button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                            {scriptType === 'call' ? '📞 Call Scripts' : scriptType === 'email' ? '✉ Email Template' : '🔗 LinkedIn Message'}
                          </span>
                          <button onClick={() => generateScript(firm, scriptType)} disabled={scriptLoading} className={`${BTN_GHOST} disabled:opacity-40`}>↻ Regenerate</button>
                          <button onClick={() => generateScript(firm, scriptType === 'call' ? 'email' : scriptType === 'email' ? 'linkedin' : 'call')} disabled={scriptLoading} className={`${BTN_GHOST} disabled:opacity-40`}>
                            Switch to {scriptType === 'call' ? 'Email' : scriptType === 'email' ? 'LinkedIn' : 'Call'}
                          </button>
                          <button onClick={() => { setScriptOpen(null); setScriptText(''); }} className="ml-auto text-xs text-gray-500 hover:text-gray-900 font-bold">✕</button>
                        </div>

                        {scriptLoading ? (
                          <div className="text-xs text-gray-600 font-medium animate-pulse">Generating...</div>
                        ) : scriptType === 'email' ? (
                          <div className="flex flex-col gap-3">
                            {emailSubject && (
                              <div className="flex items-center gap-2 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
                                <span className="text-xs text-gray-600 font-semibold uppercase tracking-wide shrink-0">Subject:</span>
                                <span className="text-sm text-gray-900">{emailSubject}</span>
                              </div>
                            )}
                            <pre className="text-sm text-gray-900 bg-slate-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap leading-relaxed font-sans">{emailBody}</pre>
                            <button onClick={() => openInOutlook(pc?.email || undefined)}
                              className="self-start flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold px-4 py-2 rounded-lg transition-all text-sm">
                              📧 Open in Outlook
                            </button>
                            {/* Chat refinement */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                              <div className="bg-white px-3 py-2 text-xs text-gray-800 font-bold border-b border-gray-200">Refine with Claude</div>
                              {chatHistory.length > 0 && (
                                <div className="max-h-48 overflow-y-auto p-3 space-y-2 bg-slate-50">
                                  {chatHistory.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`text-xs rounded-lg px-3 py-2 max-w-[85%] ${m.role === 'user' ? 'bg-[#2563eb] text-white' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>{m.content}</div>
                                    </div>
                                  ))}
                                  {chatLoading && <div className="flex justify-start"><div className="text-xs bg-white border border-gray-200 text-gray-600 rounded-lg px-3 py-2 animate-pulse">Thinking...</div></div>}
                                  <div ref={chatBottomRef} />
                                </div>
                              )}
                              <div className="flex gap-2 p-2 bg-slate-50 border-t border-gray-200">
                                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                                  placeholder="Make it shorter… change the tone…"
                                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none" />
                                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className={`${BTN_PRIMARY} disabled:opacity-40 shrink-0`}>Send</button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <pre className="text-sm text-gray-900 bg-slate-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap leading-relaxed font-sans">{scriptText}</pre>
                            <button onClick={() => navigator.clipboard.writeText(scriptText)}
                              className="absolute top-2 right-2 text-xs text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-500 px-2 py-0.5 rounded transition-all bg-white font-medium">Copy</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#eef3fb] text-gray-900">

      {/* ── Top nav bar ────────────────────────────────────────────── */}
      <header style={{ background: 'linear-gradient(135deg, #0040c0 0%, #0057e7 60%, #006aff 100%)' }}
        className="shadow-[0_6px_32px_rgba(0,71,200,0.45)]">
        <div className="max-w-7xl mx-auto px-8 flex items-center gap-8 h-[88px]">

          {/* Logo + Brand */}
          <div className="flex items-center gap-5 shrink-0">
            <img src="/logo.png" alt="Cirrobound" className="h-20 w-auto shrink-0" style={{ mixBlendMode: 'screen' }} />
            <div className="flex flex-col justify-center gap-1">
              <span className="text-white font-black text-xl tracking-[0.18em] uppercase whitespace-nowrap leading-none"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                Lead Finder
              </span>
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <span className="text-white font-semibold text-sm tracking-widest uppercase">Cirrobound Solutions</span>
                {loaded && (
                  <>
                    <span className="text-white/40 text-xs leading-none">|</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-white/80 text-xs font-medium tracking-wide">{location.city}, {location.state} · {location.radius} mi</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-white/20 shrink-0" />

          {/* Nav — segmented pill style */}
          <nav className="flex items-center bg-white/10 rounded-xl p-1 gap-0.5 shrink-0 border border-white/15">
            {(['dashboard','pipeline','leads'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-150 ${
                  view === v
                    ? 'bg-white text-[#0047c8] shadow-[0_2px_8px_rgba(0,0,0,0.18)]'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}>
                {v === 'dashboard' ? 'Dashboard' : v === 'pipeline' ? 'Pipeline' : 'Leads'}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {dirty && !syncing && (
              <span className="text-xs text-yellow-200 font-semibold whitespace-nowrap animate-pulse">● Saving…</span>
            )}
            {syncing && (
              <span className="text-xs text-white font-semibold whitespace-nowrap animate-pulse">● Syncing…</span>
            )}
            {syncMsg && !dirty && !syncing && (
              <span className="inline-flex items-center gap-1.5 text-xs text-white font-semibold whitespace-nowrap bg-white/12 px-3 py-1.5 rounded-lg border border-white/20">
                {syncMsg.startsWith('Loaded') || syncMsg.startsWith('Saved')
                  ? <span className="text-emerald-300 text-sm leading-none">✓</span>
                  : <span className="text-yellow-300 text-sm leading-none">⚠</span>}
                {syncMsg}
              </span>
            )}
            <a href="/signout"
              className="text-xs text-white/90 font-semibold whitespace-nowrap hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 px-4 py-2 rounded-lg transition-all tracking-widest uppercase">
              Sign Out
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {/* Location settings */}
        <div className="mb-5">
          <button onClick={() => setShowLocation(v => !v)}
            className="text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-2 rounded-lg transition-all flex items-center gap-2 bg-white">
            <span>⚙ Location Settings</span>
            {loaded && <span className="text-blue-400 font-medium">{location.city}, {location.state} · {location.radius} mi</span>}
            <span className="text-gray-400">{showLocation ? '▲' : '▼'}</span>
          </button>

          {showLocation && (
            <div className="mt-3 bg-white border border-blue-100 rounded-xl shadow-[0_2px_12px_rgba(0,87,231,0.08)] p-5 flex flex-wrap gap-4 items-end">
              {[
                { label:'City',           key:'city',   type:'text',   w:'w-44', ph:'Spartanburg', extra: {} },
                { label:'State',          key:'state',  type:'text',   w:'w-20', ph:'SC',          extra: { maxLength:2 } },
                { label:'Radius (miles)', key:'radius', type:'number', w:'w-28', ph:'50',          extra: { min:5, max:150 } },
              ].map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">{f.label}</label>
                  <input type={f.type} value={(locationDraft as any)[f.key]}
                    onChange={e => setLocationDraft(p => ({ ...p, [f.key]: f.key === 'state' ? e.target.value.toUpperCase().slice(0,2) : f.key === 'radius' ? Number(e.target.value) : e.target.value }))}
                    placeholder={f.ph} {...f.extra}
                    className={`bg-slate-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#2563eb] ${f.w}`} />
                </div>
              ))}
              <button onClick={() => { setShowLocation(false); search_(locationDraft); }} disabled={loading || !locationDraft.city || !locationDraft.state}
                className="bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold px-6 py-2 rounded-lg text-sm uppercase tracking-widest shadow-[0_0_16px_rgba(26,53,208,0.4)]">
                {loading ? 'Searching...' : 'Search This Area'}
              </button>
              <button onClick={() => setLocationDraft(DEFAULT_LOCATION)} className="text-xs text-slate-500 hover:text-slate-500 px-3 py-2 rounded-lg border border-transparent hover:border-gray-200">Reset</button>
            </div>
          )}
        </div>

        {/* Content */}
        {!loaded ? (
          <button onClick={() => search_()} disabled={loading}
            className="bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold px-8 py-3 rounded-lg uppercase tracking-widest text-sm shadow-[0_0_24px_rgba(26,53,208,0.45)]">
            {loading ? 'Scanning...' : 'Search Firms'}
          </button>
        ) : view === 'dashboard' ? DashboardView() : view === 'pipeline' ? PipelineView() : LeadsView()}

      </div>
    </main>
  );
}
