// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server";

type GeocodeRequestBody = {
  query: string;
};

type GeocodeResult = {
  formatted?: string;
  lat: number;
  lng: number;
};

export async function POST(req: NextRequest) {
  try {
    const body: GeocodeRequestBody = await req.json();
    const q = (body?.query || "").trim();
    if (!q) return NextResponse.json({ error: "Query missing" }, { status: 400 });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ error: "Server missing GOOGLE_MAPS_API_KEY" }, { status: 500 });

    // Use Google Geocoding REST API (classic)
    const params = new URLSearchParams({
      address: q,
      key,
    });

    const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json({ error: "Geocode provider error", detail: txt }, { status: 502 });
    }

    // Narrow the shape of the external response
    const j = (await resp.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };

    const first = j.results && j.results[0];
    if (!first || !first.geometry?.location?.lat || !first.geometry?.location?.lng) {
      return NextResponse.json({ error: "No results" }, { status: 404 });
    }

    const result: GeocodeResult = {
      formatted: first.formatted_address,
      lat: first.geometry.location.lat as number,
      lng: first.geometry.location.lng as number,
    };

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
