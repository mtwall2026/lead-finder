import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sub-pages to try for contact info
const CONTACT_PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/team', '/staff', '/our-team'];

// Extract email addresses from raw HTML/text
function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches)].filter(e =>
    !e.includes('example.com') &&
    !e.includes('sentry.io') &&
    !e.includes('wixpress') &&
    !e.includes('@2x') &&
    !e.endsWith('.png') &&
    !e.endsWith('.jpg') &&
    !e.includes('schema.org') &&
    !e.includes('w3.org')
  );
}

// Extract LinkedIn profile/company URLs from text
function extractLinkedIn(text: string): string[] {
  const matches = text.match(/https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[a-zA-Z0-9\-_%]+\/?/g) ?? [];
  return [...new Set(matches)];
}

// Fetch a URL and return plain text (strip tags)
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

// Search DuckDuckGo and return result snippets + URLs
async function duckDuckGoSearch(query: string): Promise<{ text: string; urls: string[] }> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await fetchText(url);
    // Pull URLs from result links
    const urlMatches = html.match(/uddg=([^&"'\s]+)/g) ?? [];
    const urls = urlMatches
      .map(m => decodeURIComponent(m.replace('uddg=', '')))
      .filter(u => u.startsWith('http'))
      .slice(0, 8);
    return { text: html.slice(0, 5000), urls };
  } catch {
    return { text: '', urls: [] };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { firmName, website, address } = await req.json();

    const location = address ?? '';

    // Run website scrape and web searches in parallel
    const [websitePages, contactSearch, linkedInSearch] = await Promise.all([
      // 1. Scrape firm's own website sub-pages
      website
        ? Promise.all(CONTACT_PATHS.map(path => fetchText(website.replace(/\/$/, '') + path)))
        : Promise.resolve([]),

      // 2. DuckDuckGo search for contact info
      duckDuckGoSearch(`"${firmName}" ${location} contact email`),

      // 3. DuckDuckGo search specifically for LinkedIn
      duckDuckGoSearch(`"${firmName}" ${location} site:linkedin.com`),
    ]);

    const websiteText = websitePages.join(' ').replace(/\s+/g, ' ').slice(0, 8000);
    const searchText  = contactSearch.text;
    const allText     = (websiteText + ' ' + searchText).slice(0, 12000);

    // Extract emails and LinkedIn URLs
    const emails    = extractEmails(allText);
    const linkedIns = [
      ...extractLinkedIn(websiteText),
      ...extractLinkedIn(searchText),
      ...extractLinkedIn(linkedInSearch.text),
      ...linkedInSearch.urls.filter(u => u.includes('linkedin.com')),
    ];
    const uniqueLinkedIns = [...new Set(linkedIns)].slice(0, 3);

    // Ask Claude to synthesize everything into structured contact info
    const prompt = `You are extracting contact information for "${firmName}" (${location}) from website and web search data.

Website text:
${websiteText.slice(0, 4000)}

Web search results:
${searchText.slice(0, 3000)}

Emails found: ${emails.length > 0 ? emails.join(', ') : 'none'}
LinkedIn URLs found: ${uniqueLinkedIns.length > 0 ? uniqueLinkedIns.join(', ') : 'none'}

Tasks:
1. Identify the best contact person — owner, principal, managing partner, office manager, or administrator. Return their name and title.
2. Pick the single best contact email. Prefer direct/personal emails over generic (info@, contact@, admin@). If only generic exist, use the best one.
3. Return the best LinkedIn URL if one was found (prefer a person's profile over a company page, but either is fine).

Respond ONLY with JSON in this exact format (use null if not found):
{"contactPerson": "Name, Title", "contactEmail": "email@domain.com", "linkedIn": "https://linkedin.com/..."}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return NextResponse.json({
      contactPerson: result.contactPerson ?? null,
      contactEmail:  result.contactEmail  ?? null,
      linkedIn:      result.linkedIn      ?? null,
      emailsFound:   emails,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
