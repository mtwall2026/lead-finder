import { NextResponse } from 'next/server';

// 50-mile bounding box around Spartanburg, SC (34.9496, -81.9321)
// 1° lat ≈ 69 miles, 1° lon ≈ 56.5 miles at this latitude
const BOUNDS = {
  low:  { latitude: 34.2252, longitude: -82.8166 },
  high: { latitude: 35.6740, longitude: -81.0476 },
};

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'nextPageToken',
].join(',');

async function searchAll(query: string, maxResults = 100): Promise<object[]> {
  const places: object[] = [];
  let pageToken: string | undefined;

  while (places.length < maxResults) {
    const body: Record<string, unknown> = {
      textQuery: query,
      locationRestriction: { rectangle: BOUNDS },
      maxResultCount: 20,
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Places API error: ${res.status} ${res.statusText}`);

    const data = await res.json();
    places.push(...(data.places ?? []));

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return places.slice(0, maxResults);
}

export async function GET() {
  try {
    const [engineering, law] = await Promise.all([
      searchAll('engineering consulting firm Spartanburg SC'),
      searchAll('law firm Spartanburg SC'),
    ]);

    return NextResponse.json({ engineering, law });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
