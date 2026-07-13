import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TAB_LABEL: Record<string, string> = {
  engineering:  'engineering consulting firm',
  law:          'law firm',
  it:           'IT managed services / technology consulting firm',
  architecture: 'architecture firm',
  accounting:   'accounting / CPA firm',
  dental:       'dental office',
  medical:      'medical office / primary care clinic',
  pt:           'physical therapy clinic',
};

// Industry-specific AI use cases Cirrobound can deliver
const AI_USE_CASES: Record<string, string> = {
  engineering: `
- AI-generated engineering reports, project summaries, and spec drafts that cut documentation time in half
- AI agents that pull data from project management tools and auto-generate status updates for clients
- ChatGPT/Claude integrated into their workflow to help engineers draft RFPs, proposals, and technical memos faster
- AI training sessions so their team actually uses these tools consistently and correctly
- Automated meeting notes and action item extraction from project calls`,

  law: `
- AI-assisted contract review and redlining that spots issues in minutes instead of hours
- Claude integrated into their practice to help draft motions, briefs, and client letters
- AI-powered client intake automation — forms, summaries, conflict checks
- Document summarization for case research and discovery review
- AI training for attorneys and paralegals so the whole team levels up, not just one person`,

  it: `
- AI workflow automation that eliminates repetitive tier-1 tickets and support tasks
- Claude/ChatGPT integrated into their internal tools and client-facing systems
- AI agents that monitor, report, and take action on common infrastructure events
- Staff AI training so their techs can leverage AI for faster troubleshooting and documentation
- Custom AI solutions built on top of their existing stack`,

  architecture: `
- AI that drafts project narratives, client presentations, and specification sections in minutes
- Claude integrated into their design workflow to generate design rationale, scope documents, and RFP responses
- AI agents that pull from project data and auto-generate progress reports for clients
- Automated meeting summaries and action items from client and contractor calls
- AI training so their entire team — not just principals — uses these tools consistently`,

  accounting: `
- AI that automates data entry, reconciliation summaries, and routine client communications
- Claude integrated into their workflow to draft client-facing reports, engagement letters, and tax memos
- AI agents that flag anomalies in financial data and surface them for review
- Automated workflow for gathering client documents and following up on missing items
- Staff AI training so the whole firm benefits, not just the partners`,

  dental: `
- AI that automates patient follow-up messages, recall reminders, and post-visit instructions
- Claude integrated into front desk workflows to draft insurance pre-auth letters and patient communications
- AI agents that handle routine insurance inquiry responses and documentation requests
- Automated new patient intake and paperwork summarization for the clinical team
- Staff AI training so your front desk and admin team saves hours every week`,

  medical: `
- AI-assisted clinical documentation — AI drafts SOAP notes and visit summaries from provider input
- Claude integrated into the practice to handle prior authorization letters, referral notes, and patient communications
- AI agents that follow up on outstanding labs, referrals, and patient outreach automatically
- Automated patient intake summarization so providers walk in already knowing the patient's history
- Staff AI training so your entire team — clinical and admin — works smarter`,

  pt: `
- AI that generates personalized home exercise program descriptions and patient education materials
- Claude integrated into the clinic to draft progress notes, discharge summaries, and insurance justification letters
- Automated patient check-in summaries and session prep notes for therapists
- AI agents that handle appointment reminders, re-engagement messages, and plan-of-care follow-ups
- Staff AI training so your therapists spend less time on paperwork and more time with patients`,
};

const CIRROBOUND_OVERVIEW = `Cirrobound Solutions is an AI consulting and implementation company based in Spartanburg, SC. We help small and mid-size professional businesses actually put AI to work — not just talk about it. We build custom AI workflows using tools like Claude and ChatGPT, integrate AI into existing business software, build AI agents that automate repetitive tasks, and train staff so the whole team benefits. We handle everything from strategy to implementation to ongoing support.`;

export async function POST(req: NextRequest) {
  try {
    const { firmName, address, phone, website, tab, type, contactPerson, notes } = await req.json();

    const firmType = TAB_LABEL[tab] ?? 'business';
    const location = address ?? 'Spartanburg, SC area';
    const contactLine = contactPerson ? `The contact person is ${contactPerson}.` : '';
    const notesLine = notes ? `Additional context about this firm: ${notes}` : '';
    const useCases = AI_USE_CASES[tab] ?? AI_USE_CASES['it'];

    const prompt = type === 'linkedin'
      ? `Write two short LinkedIn messages for Taylor Wall at Cirrobound Solutions reaching out to ${firmName}, a ${firmType} in ${location}. ${contactLine} ${notesLine}

About Cirrobound: ${CIRROBOUND_OVERVIEW}

Most relevant AI use case for this firm: pick the single highest-value item from this list:${useCases}

MESSAGE 1 — CONNECTION REQUEST (300 character limit, no fluff):
Short, specific, local. Reference their industry + one AI use case. Sound like a real person, not a template.

MESSAGE 2 — FOLLOW-UP MESSAGE (after they accept):
2-3 sentences max. Reference the connection, mention the specific AI use case briefly, soft ask for a 15-minute call. No dashes.

Format as:
--- CONNECTION REQUEST ---
[message]

--- FOLLOW-UP MESSAGE ---
[message]`

      : type === 'call'
      ? `You are writing a cold call script for Taylor Wall at Cirrobound Solutions. Taylor is an AI consultant based in Spartanburg, SC who helps local ${firmType}s implement AI to produce real ROI.

AI services most relevant to a ${firmType}:${useCases}

Write TWO short scripts for calling ${firmName}. ${contactLine} ${notesLine}

Taylor's natural speaking style — match this exactly:
"Hi [name], my name is Taylor Wall with Cirrobound Solutions. I'm an AI consultant here in Spartanburg County helping [firm type]s implement AI to produce ROI."
- Casual, direct, no fluff
- Sounds like a real person, not a sales rep reading a script
- Short sentences
- Local angle always mentioned

---

SCRIPT 1: GATEKEEPER
The goal is NOT to pitch. The goal is to get the decision maker's name and either be transferred or get a callback number. Keep it under 20 seconds.
- Friendly, not pushy
- Ask for the owner/managing partner/office manager by title if no name known${contactPerson ? `, or ask for ${contactPerson} by name` : ''}
- If asked "what's it about?" — give a one-liner that sounds important but doesn't over-explain: something like "I work with [firm type]s in the area on AI and wanted to reach out to whoever handles that side of the business"
- If they can't transfer, ask for the best person's name and direct number or email

SCRIPT 2: DECISION MAKER
Once you're through to the right person. Under 45 seconds total.
- Open exactly like Taylor's style above
- Pick the single most relevant AI pain point for a ${firmType} from the list
- One sentence on what Cirrobound actually does about it
- One soft question: "Is that something you've looked at at all?" or "Does that sound like something eating up time for your team?"
- Close: ask for a 15-minute call this week or next
- Handle "not interested / not ready": one honest line, no pressure, offer to follow up in 3 months

Format clearly as:
--- GATEKEEPER SCRIPT ---
[script]

--- DECISION MAKER SCRIPT ---
[script]`

      : `You are writing a cold outreach email for Taylor at Cirrobound Solutions.

About Cirrobound: ${CIRROBOUND_OVERVIEW}

AI services most relevant to a ${firmType}:${useCases}

Write a short, personalized cold email to ${firmName}, a ${firmType} located at ${location}. ${contactLine} ${notesLine}

Do NOT use dashes (hyphens or em dashes) anywhere in the email body or subject line.

The email must:
- Have a specific, non-generic subject line that references their industry and AI
- Be 4-6 sentences max in the body — short enough to read in 20 seconds
- Focus on ONE specific AI use case from the list above that is the highest-value pain point for a ${firmType}
- Feel like Taylor wrote it specifically for this firm, not a mass blast
- Make it clear Cirrobound does the implementation — they don't need to figure it out themselves
- End with one soft CTA: a reply or a 15-minute call to see if it's a fit
- Sign off as: Taylor Wall | Cirrobound Solutions

Format exactly as:
Subject: [subject line]

[email body]`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
