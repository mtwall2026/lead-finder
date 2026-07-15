import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/auth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HUNTER_KEY = process.env.HUNTER_API_KEY;

const CONTACT_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/team', '/staff', '/our-team', '/leadership'];

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
    const html = await fetchText(url);
    return html.slice(0, 5000);
  } catch {
    return '';
  }
}

function domainFromWebsite(website?: string): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!HUNTER_KEY) {
    return NextResponse.json({ error: 'HUNTER_API_KEY is not configured' }, { status: 500 });
  }

  try {
    const { firmName, website, address } = await req.json();
    const domain = domainFromWebsite(website);
    if (!domain) {
      return NextResponse.json({ error: 'No website/domain available for this firm — cannot guess an email.' }, { status: 400 });
    }

    const location = address ?? '';

    // 1. Find the COO's name (fall back to closest equivalent leadership title)
    const [websitePages, searchText] = await Promise.all([
      Promise.all(CONTACT_PATHS.map(path => fetchText(website.replace(/\/$/, '') + path))),
      duckDuckGoSearch(`"${firmName}" ${location} COO OR "Chief Operating Officer"`),
    ]);
    const websiteText = websitePages.join(' ').replace(/\s+/g, ' ').slice(0, 8000);

    const namePrompt = `You are identifying the COO (Chief Operating Officer) of "${firmName}" (${location}) from website and web search data.

Website text:
${websiteText.slice(0, 4000)}

Web search results:
${searchText.slice(0, 3000)}

Tasks:
1. Look for someone with the title "COO" or "Chief Operating Officer".
2. If no COO is found, pick the closest equivalent leadership contact instead (owner, president, managing partner, practice manager, office manager) and set foundCOO to false.
3. Only return a person if you have a clear first and last name. Do not guess a full name from partial info.

Respond ONLY with JSON in this exact format (use null if not found):
{"firstName": "First", "lastName": "Last", "title": "Title", "foundCOO": true}`;

    const nameMsg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: namePrompt }],
    });
    const nameText = nameMsg.content[0].type === 'text' ? nameMsg.content[0].text.trim() : '{}';
    const nameJsonMatch = nameText.match(/\{[\s\S]*\}/);
    const person = nameJsonMatch ? JSON.parse(nameJsonMatch[0]) : {};

    if (!person.firstName || !person.lastName) {
      return NextResponse.json({ contactPerson: null, title: null, email: null, verified: false, message: 'No named leadership contact found.' });
    }

    // 2. Guess the email from the domain's pattern via Hunter's Email Finder
    const finderParams = new URLSearchParams({
      domain, first_name: person.firstName, last_name: person.lastName, api_key: HUNTER_KEY,
    });
    const finderRes = await fetch(`https://api.hunter.io/v2/email-finder?${finderParams}`, { signal: AbortSignal.timeout(10000) });
    const finderData = await finderRes.json();
    if (!finderRes.ok) {
      return NextResponse.json({ error: `Hunter email-finder error: ${finderData?.errors?.[0]?.details ?? finderRes.status}` }, { status: 502 });
    }
    const guessedEmail: string | null = finderData?.data?.email ?? null;

    if (!guessedEmail) {
      return NextResponse.json({
        contactPerson: `${person.firstName} ${person.lastName}`, title: person.title ?? null,
        email: null, verified: false, message: 'No email pattern could be found for this domain.',
      });
    }

    // 3. Verify deliverability via Hunter's Email Verifier
    const verifierParams = new URLSearchParams({ email: guessedEmail, api_key: HUNTER_KEY });
    const verifierRes = await fetch(`https://api.hunter.io/v2/email-verifier?${verifierParams}`, { signal: AbortSignal.timeout(10000) });
    const verifierData = await verifierRes.json();
    if (!verifierRes.ok) {
      return NextResponse.json({ error: `Hunter email-verifier error: ${verifierData?.errors?.[0]?.details ?? verifierRes.status}` }, { status: 502 });
    }
    const status: string = verifierData?.data?.status ?? 'unknown';
    const score: number = verifierData?.data?.score ?? 0;
    const verified = status === 'valid';

    return NextResponse.json({
      contactPerson: `${person.firstName} ${person.lastName}`,
      title: person.title ?? null,
      foundCOO: !!person.foundCOO,
      email: guessedEmail,
      status,
      score,
      verified,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
