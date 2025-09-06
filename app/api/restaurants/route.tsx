import { NextRequest, NextResponse } from "next/server";

type SearchBody = {
  lat: number;
  lng: number;
  radiusMeters?: number;
  openNow?: boolean;
  minRating?: number; // 0..5 in steps of 0.5 when using TextSearch
  cuisine?: string;   // e.g., "biryani", "south indian", "pizza"
  priceLevels?: ("PRICE_LEVEL_INEXPENSIVE"|"PRICE_LEVEL_MODERATE"|"PRICE_LEVEL_EXPENSIVE"|"PRICE_LEVEL_VERY_EXPENSIVE")[];
  dietary?: "veg" | "nonveg" | "both";
  services?: { delivery?: boolean; dineIn?: boolean; takeout?: boolean };
  topK?: number; // default 5
};

const GOOGLE = "https://places.googleapis.com/v1";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.shortFormattedAddress",
  "places.googleMapsUri",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.delivery",
  "places.dineIn",
  "places.takeout",
  "places.servesVegetarianFood",
  "places.photos" 
].join(",");

function haversineMeters(a:{lat:number,lng:number}, b:{lat:number,lng:number}){
  const toRad = (x:number)=>x*Math.PI/180;
  const R=6371000;
  const dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
  const s1=Math.sin(dLat/2), s2=Math.sin(dLng/2);
  const q=s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
  return 2*R*Math.asin(Math.sqrt(q));
}

function scorePlace(p:any, center:{lat:number,lng:number}, prefs:SearchBody){
  const r = typeof p.rating === "number" ? p.rating : 0;
  const n = typeof p.userRatingCount === "number" ? p.userRatingCount : 0;
  const ratingQuality = (r/5) * (1 - Math.exp(-n/200));

  const need = prefs.services || {};
  let serviceMatches = 0, serviceAsked = 0;
  (["delivery","dineIn","takeout"] as const).forEach(k=>{
    if (need[k] !== undefined) { serviceAsked++; if (!!p[k] === need[k]) serviceMatches++; }
  });
  const serviceMatch = serviceAsked ? serviceMatches / serviceAsked : 1;

  let dietaryMatch = 1;
  if (prefs.dietary === "veg") dietaryMatch = p.servesVegetarianFood ? 1 : 0;

  let priceFit = 1;
  if (prefs.priceLevels?.length) priceFit = prefs.priceLevels.includes(p.priceLevel) ? 1 : 0.5;

  let distanceScore = 1;
  if (p.location?.latitude && p.location?.longitude && prefs.radiusMeters) {
    const d = haversineMeters(center, {lat:p.location.latitude, lng:p.location.longitude});
    distanceScore = Math.max(0, 1 - d / prefs.radiusMeters);
  }

  return 0.50 * ratingQuality + 0.20 * serviceMatch + 0.15 * dietaryMatch + 0.10 * distanceScore + 0.05 * priceFit;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY" }, { status: 500 });

    const prefs: SearchBody = await req.json();
    const {
      lat, lng,
      cuisine = "",
      radiusMeters = 2000,
      openNow = false,
      minRating = 0,
      priceLevels = [],
      dietary = "both",
      services = {},
      topK = 5
    } = prefs;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "lat and lng are required numbers." }, { status: 400 });
    }

    const useText = cuisine.trim().length > 0;
    const url = useText ? `${GOOGLE}/places:searchText` : `${GOOGLE}/places:searchNearby`;

    // ✅ FIX: Text Search uses locationBias.circle; Nearby uses locationRestriction.circle
    const body = useText
      ? {
          textQuery: `${cuisine} restaurant`,
          includedType: "restaurant",
          openNow,
          minRating,
          priceLevels: priceLevels.length ? priceLevels : undefined,
          locationBias: {                       // <-- changed from locationRestriction
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radiusMeters
            }
          },
          pageSize: 20
        }
      : {
          includedTypes: ["restaurant"],
          locationRestriction: {                // <-- still circle (valid for Nearby)
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radiusMeters
            }
          },
          maxResultCount: 20,
          rankPreference: "POPULARITY"
        };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let upstream: any = null;
      try { upstream = await res.json(); } catch { upstream = { detail: await res.text() }; }
      console.error("[Places API error]", res.status, upstream);
      return NextResponse.json(
        { error: "Places API error", upstreamStatus: res.status, upstream },
        { status: res.status }
      );
    }

    const json = await res.json();
    const places = Array.isArray(json.places) ? json.places : [];

    const filtered = places.filter((p:any) => useText ? true : (!openNow || p?.currentOpeningHours?.openNow === true));

    const center = { lat, lng };
    const ranked = filtered
      .map((p:any) => ({ ...p, _score: scorePlace(p, center, prefs) }))
      .sort((a:any,b:any)=> b._score - a._score)
      .slice(0, Math.max(1, topK));

    return NextResponse.json({ results: ranked }, { status: 200 });
  } catch (e:any) {
    console.error("[Route error]", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
