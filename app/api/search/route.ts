import { NextRequest, NextResponse } from 'next/server';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'nextPageToken',
].join(',');

const TAB_QUERIES: Record<string, string> = {
  engineering:   'engineering consulting firm',
  law:           'law firm',
  it:            'IT managed services technology consulting',
  architecture:  'architecture firm',
  accounting:    'accounting CPA firm',
  dental:        'dentist dental office',
  medical:       'small medical office primary care clinic',
  pt:            'physical therapy clinic',
};

async function geocode(city: string, state: string): Promise<{ lat: number; lng: number }> {
  const q = encodeURIComponent(`${city}, ${state}`);
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&key=${process.env.GOOGLE_PLACES_API_KEY}`
  );
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) {
    throw new Error(`Geocode failed for "${city}, ${state}": ${data.status}`);
  }
  return data.results[0].geometry.location;
}

function buildBounds(lat: number, lng: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180));
  return {
    low:  { latitude: lat - latDelta, longitude: lng - lngDelta },
    high: { latitude: lat + latDelta, longitude: lng + lngDelta },
  };
}

async function searchAll(query: string, locationLabel: string, bounds: object, maxResults = 100): Promise<object[]> {
  const places: object[] = [];
  let pageToken: string | undefined;

  while (places.length < maxResults) {
    const body: Record<string, unknown> = {
      textQuery: `${query} ${locationLabel}`,
      locationRestriction: { rectangle: bounds },
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const city   = searchParams.get('city')   ?? 'Spartanburg';
    const state  = searchParams.get('state')  ?? 'SC';
    const radius = Math.min(Math.max(Number(searchParams.get('radius') ?? 50), 5), 150);
    const types  = (searchParams.get('types') ?? Object.keys(TAB_QUERIES).join(',')).split(',').filter(t => TAB_QUERIES[t]);

    const { lat, lng } = await geocode(city, state);
    const bounds = buildBounds(lat, lng, radius);
    const locationLabel = `${city} ${state}`;

    const results = await Promise.all(
      types.map(type => searchAll(TAB_QUERIES[type], locationLabel, bounds))
    );

    const out: Record<string, object[]> = {};
    types.forEach((type, i) => { out[type] = results[i]; });

    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
