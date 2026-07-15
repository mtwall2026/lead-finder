import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/auth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HUNTER_KEY = process.env.HUNTER_API_KEY;

const CONTACT_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/team', '/staff', '/our-team', '/leadership'];

// Ranked by how likely each role is to actually reply to cold outreach (not just seniority).
const TITLE_TIERS: { pattern: RegExp; tier: number; label: string }[] = [
  { pattern: /office manager|practice manager|practice administrator|operations manager|business manager/i,
    tier: 1, label: 'Most likely to respond — runs day-to-day ops & vendor outreach' },
  { pattern: /\bit\b.*manager|director of it|it director|network administrator|technology manager/i,
    tier: 2, label: 'Likely to respond — technical evaluator' },
  { pattern: /owner|president|managing partner|managing director/i,
    tier: 3, label: 'Decision-maker — lower reply rate, high impact' },
  { pattern: /\bcoo\b|chief operating officer/i,
    tier: 4, label: 'Executive — moderate reply rate' },
  { pattern: /\bcfo\b|controller|chief financial officer/i,
    tier: 5, label: 'Finance — best if the pitch has a cost angle' },
];
const MAX_CONTACTS = 6;

function categorize(title: string): { tier: number; label: string } {
  for (const t of TITLE_TIERS) if (t.pattern.test(title)) return { tier: t.tier, label: t.label };
  return { tier: 6, label: 'Other' };
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 8000);
  } catch {
    return '';
  }
}

async function duckDuckGoSearch(query: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    return (await fetchText(url)).slice(0, 5000);
  } catch {
    return '';
  }
}

function domainFromWebsite(website?: string): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface FoundPerson { firstName: string; lastName: string; title: string; }

async function guessAndVerify(domain: string, p: FoundPerson) {
  try {
    const finderParams = new URLSearchParams({ domain, first_name: p.firstName, last_name: p.lastName, api_key: HUNTER_KEY! });
    const finderRes = await fetch(`https://api.hunter.io/v2/email-finder?${finderParams}`, { signal: AbortSignal.timeout(10000) });
    const finderData = await finderRes.json();
    const email: string | null = finderRes.ok ? (finderData?.data?.email ?? null) : null;
    if (!email) return { email: null, verified: false, status: 'no-match' };

    const verifierParams = new URLSearchParams({ email, api_key: HUNTER_KEY! });
    const verifierRes = await fetch(`https://api.hunter.io/v2/email-verifier?${verifierParams}`, { signal: AbortSignal.timeout(10000) });
    const verifierData = await verifierRes.json();
    const status: string = verifierRes.ok ? (verifierData?.data?.status ?? 'unknown') : 'error';
    return { email, verified: status === 'valid', status };
  } catch {
    return { email: null, verified: false, status: 'error' };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { firmName, website, address } = await req.json();
    const location = address ?? '';
    const domain = domainFromWebsite(website);

    const [websitePages, searchText] = await Promise.all([
      website ? Promise.all(CONTACT_PATHS.map(path => fetchText(website.replace(/\/$/, '') + path))) : Promise.resolve([]),
      duckDuckGoSearch(`"${firmName}" ${location} team OR staff OR leadership OR "office manager" OR owner OR president`),
    ]);
    const websiteText = websitePages.join(' ').replace(/\s+/g, ' ').slice(0, 8000);

    const prompt = `You are identifying key staff at "${firmName}" (${location}) from website and web search data, for B2B sales outreach.

Website text:
${websiteText.slice(0, 4500)}

Web search results:
${searchText.slice(0, 3000)}

Find every named person whose title matches ANY of these categories:
- Office Manager, Practice Manager, Practice Administrator, Operations Manager, Business Manager
- IT Manager, Director of IT, Network Administrator, Technology Manager
- Owner, President, Managing Partner, Managing Director
- COO / Chief Operating Officer
- CFO / Controller / Chief Financial Officer

Rules:
- Only include a person if you have a clear first AND last name. Never invent or guess a name.
- Do not include the same person twice.
- Use their exact title as found.

Respond ONLY with JSON in this exact format (empty array if nobody matches):
{"people": [{"firstName": "First", "lastName": "Last", "title": "Exact Title"}]}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { people: [] };
    const people: FoundPerson[] = Array.isArray(parsed.people) ? parsed.people : [];

    const categorized = people
      .filter(p => p.firstName && p.lastName)
      .map(p => ({ ...p, ...categorize(p.title ?? '') }))
      .sort((a, b) => a.tier - b.tier)
      .slice(0, MAX_CONTACTS);

    if (!HUNTER_KEY || !domain) {
      return NextResponse.json({
        contacts: categorized.map(p => ({
          name: `${p.firstName} ${p.lastName}`, title: p.title, tier: p.tier, tierLabel: p.label,
          email: null, verified: false, status: !domain ? 'no-domain' : 'no-hunter-key',
        })),
      });
    }

    const results = await Promise.all(categorized.map(p => guessAndVerify(domain, p)));
    const contacts = categorized.map((p, i) => ({
      name: `${p.firstName} ${p.lastName}`, title: p.title, tier: p.tier, tierLabel: p.label,
      email: results[i].email, verified: results[i].verified, status: results[i].status,
    }));

    return NextResponse.json({ contacts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
