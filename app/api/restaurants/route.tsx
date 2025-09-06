// app/api/restaurants/route.ts
import { NextRequest, NextResponse } from "next/server";

type ServicePrefs = { delivery?: boolean; dineIn?: boolean; takeout?: boolean };

type SearchBody = {
  lat: number;
  lng: number;
  radiusMeters?: number;
  openNow?: boolean;
  minRating?: number;
  cuisine?: string;
  priceLevels?: (
    | "PRICE_LEVEL_INEXPENSIVE"
    | "PRICE_LEVEL_MODERATE"
    | "PRICE_LEVEL_EXPENSIVE"
    | "PRICE_LEVEL_VERY_EXPENSIVE"
  )[];
  dietary?: "veg" | "nonveg" | "both";
  services?: ServicePrefs;
  topK?: number;
};

type Photo = { name?: string };

type PlaceFromAPI = {
  id: string;
  displayName?: { text?: string } | string;
  location?: { latitude?: number; longitude?: number };
  shortFormattedAddress?: string;
  googleMapsUri?: string;
  types?: string[];
  rating?: number | null;
  userRatingCount?: number | null;
  priceLevel?: string | null;
  currentOpeningHours?: { openNow?: boolean } | null;
  delivery?: boolean | null;
  dineIn?: boolean | null;
  takeout?: boolean | null;
  servesVegetarianFood?: boolean | null;
  photos?: Photo[] | null;
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
  "places.photos",
].join(",");

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat),
    dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2),
    s2 = Math.sin(dLng / 2);
  const q = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

function scorePlace(p: PlaceFromAPI, center: { lat: number; lng: number }, prefs: SearchBody) {
  const r = typeof p.rating === "number" ? p.rating : 0;
  const n = typeof p.userRatingCount === "number" ? p.userRatingCount : 0;
  const ratingQuality = (r / 5) * (1 - Math.exp(-n / 200));

  // Services match
  const need: ServicePrefs = prefs.services ?? {};
  let serviceMatches = 0,
    serviceAsked = 0;
  (["delivery", "dineIn", "takeout"] as const).forEach((k) => {
    const asked = need[k] !== undefined;
    if (asked) {
      serviceAsked++;
      if (!!(p as any)[k] === need[k]) serviceMatches++; // p[k] can be null/undefined
    }
  });
  const serviceMatch = serviceAsked ? serviceMatches / serviceAsked : 1;

  // Dietary
  let dietaryMatch = 1;
  if (prefs.dietary === "veg") {
    dietaryMatch = p.servesVegetarianFood ? 1 : 0;
  }

  // Price fit (if user constrained)
  let priceFit = 1;
  if (prefs.priceLevels && prefs.priceLevels.length) {
    priceFit = prefs.priceLevels.includes(p.priceLevel as any) ? 1 : 0.5;
  }

  // Distance (closer is better)
  let distanceScore = 1;
  if (p.location?.latitude && p.location?.longitude && prefs.radiusMeters) {
    const d = haversineMeters(center, { lat: p.location.latitude, lng: p.location.longitude });
    distanceScore = Math.max(0, 1 - d / prefs.radiusMeters);
  }

  return 0.5 * ratingQuality + 0.2 * serviceMatch + 0.15 * dietaryMatch + 0.1 * distanceScore + 0.05 * priceFit;
}

export async function POST(req: NextRequest) {
  try {
    const prefs = (await req.json()) as SearchBody;
    const {
      lat,
      lng,
      cuisine = "",
      radiusMeters = 2000,
      openNow = false,
      minRating = 0,
      priceLevels = [],
      dietary = "both",
      services = {},
      topK = 5,
    } = prefs;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
    }

    const useText = cuisine.trim().length > 0;
    const url = useText ? `${GOOGLE}/places:searchText` : `${GOOGLE}/places:searchNearby`;

    const bodyText = useText
      ? {
          textQuery: `${cuisine} restaurant`,
          includedType: "restaurant",
          openNow,
          minRating,
          priceLevels: priceLevels.length ? priceLevels : undefined,
          locationBias: {
            circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
          },
          pageSize: 20,
        }
      : {
          includedTypes: ["restaurant"],
          locationRestriction: {
            circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
          },
          maxResultCount: 20,
          rankPreference: "POPULARITY",
        };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY ?? "",
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(bodyText),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Places API error`, detail: errText }, { status: 502 });
    }

    const json = (await res.json()) as { places?: PlaceFromAPI[] };
    const places = Array.isArray(json.places) ? json.places : [];

    // server-side filter for openNow when using nearby fallback
    const filtered = places.filter((p) => {
      if (useText) {
        return !(openNow && p?.currentOpeningHours?.openNow !== true) || !openNow;
      }
      return !openNow || p?.currentOpeningHours?.openNow === true;
    });

    // Rank & slice top K
    const center = { lat, lng };
    const ranked = filtered
      .map((p) => ({ ...p, _score: scorePlace(p, center, prefs) }))
      .sort((a, b) => (b as any)._score - (a as any)._score)
      .slice(0, Math.max(1, Math.min(20, topK)));

    // Optional: AI re-rank/explain (if OPENAI_API_KEY present)
    let ai: unknown = null;
    if (process.env.OPENAI_API_KEY && ranked.length > 0) {
      try {
        const candidates = ranked.map((p) => ({
          id: p.id,
          name: typeof p.displayName === "string" ? p.displayName : p.displayName?.text,
          rating: p.rating,
          userRatingCount: p.userRatingCount,
          priceLevel: p.priceLevel,
          address: p.shortFormattedAddress,
          delivery: p.delivery ?? null,
          dineIn: p.dineIn ?? null,
          takeout: p.takeout ?? null,
          servesVegetarianFood: p.servesVegetarianFood ?? null,
          mapsUri: p.googleMapsUri,
          score: (p as any)._score,
        }));

        const payload = {
          model: "gpt-5",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "RestaurantRanking",
              schema: {
                type: "object",
                properties: {
                  rationale: { type: "string" },
                  reordered: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["id", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["rationale", "reordered"],
                additionalProperties: false,
              },
            },
          },
          input: [
            { role: "system", content: "You are a careful multi-criteria re-ranker for restaurants." },
            { role: "user", content: `User prefs: ${JSON.stringify({ dietary, services, minRating, openNow, priceLevels })}\nCandidates: ${JSON.stringify(candidates)}` },
          ],
        };

        const resp = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          const data = await resp.json();
          const text = (data as any)?.output?.[0]?.content?.[0]?.text;
          if (text) {
            try {
              ai = JSON.parse(text);
              const idToPlace = Object.fromEntries(ranked.map((p) => [p.id, p]));
              const ordered = (ai as any).reordered?.map((x: { id: string }) => idToPlace[x.id]).filter(Boolean);
              if (ordered && ordered.length) {
                const seen = new Set<string>();
                const final = [...ordered, ...ranked].filter((p) => {
                  if (!p || seen.has(p.id)) return false;
                  seen.add(p.id);
                  return true;
                }).slice(0, Math.max(1, Math.min(20, topK)));
                return NextResponse.json({ results: final, ai }, { status: 200 });
              }
            } catch {
              /* ignore JSON parsing problems */
            }
          }
        }
      } catch {
        /* ignore AI errors; return heuristic results */
      }
    }

    return NextResponse.json({ results: ranked, ai }, { status: 200 });
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
