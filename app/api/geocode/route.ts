import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY" }, { status: 500 });

    const { query } = (await req.json()) as { query?: string };
    if (!query || !query.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query.trim());
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    const json = await res.json();

    if (json.status !== "OK" || !json.results?.length) {
      return NextResponse.json({ error: "No results", upstream: json }, { status: 404 });
    }

    const best = json.results[0];
    const { lat, lng } = best.geometry.location;
    const formatted = best.formatted_address;

    return NextResponse.json({ lat, lng, formatted, raw: best });
  } catch (e: any) {
    console.error("[Geocode error]", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

// Optional: block GET to avoid accidental calls
export async function GET() {
  return NextResponse.json({ error: "Use POST /api/geocode" }, { status: 405 });
}
