import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { subject, body, toEmail } = await req.json();

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: 'HTML', content: body },
  };

  if (toEmail) {
    message.toRecipients = [{ emailAddress: { address: toEmail } }];
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Graph error ${res.status}: ${err}` }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ webLink: data.webLink, id: data.id });
}
