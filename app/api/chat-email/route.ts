import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { subject, body, history, message } = await req.json();

    const system = `You are an email writing assistant helping Taylor at Cirrobound Solutions refine cold outreach emails to potential clients.

The current email draft is:
Subject: ${subject}

${body}

When the user asks you to change the email, rewrite it and return ONLY a JSON object in this exact format (no other text):
{"subject":"...","body":"...","reply":"Brief note about what you changed"}

When the user asks a question or wants to chat without changing the email, respond conversationally in plain text (not JSON).

Never use dashes (hyphens or em dashes) anywhere in the email. Keep the email focused on AI services — workflow automation, Claude/ChatGPT integration, AI agents, staff training. Always sign off as Taylor Wall | Cirrobound Solutions.`;

    const messages = [
      ...history,
      { role: 'user' as const, content: message },
    ];

    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages,
    });

    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '';

    // Try to parse as a JSON email update
    try {
      const parsed = JSON.parse(text);
      if (parsed.subject && parsed.body) {
        return NextResponse.json({
          type: 'update',
          subject: parsed.subject,
          body: parsed.body,
          reply: parsed.reply ?? 'Updated the email.',
        });
      }
    } catch {
      // Not JSON — plain chat reply
    }

    return NextResponse.json({ type: 'chat', reply: text });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
