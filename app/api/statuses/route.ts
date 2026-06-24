import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const ONEDRIVE_PATH = 'root:/Apps/lead-finder/statuses.json:';

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/${ONEDRIVE_PATH}/content`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  );

  if (res.status === 404) return NextResponse.json({});
  if (!res.ok) return NextResponse.json({ error: `Graph error ${res.status}` }, { status: 500 });

  return NextResponse.json(await res.json());
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/${ONEDRIVE_PATH}/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) return NextResponse.json({ error: `Graph error ${res.status}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
