"use client";
import { useMemo, useState } from "react";

type ServicePrefs = { delivery?: boolean; dineIn?: boolean; takeout?: boolean };

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

function Badge({
  children,
  color = "gray",
}: {
  children: React.ReactNode;
  color?: "gray" | "green" | "blue" | "yellow" | "purple" | "pink";
}) {
  const colors: Record<string, string> = {
    gray: "border-gray-200 bg-gray-50 text-gray-700",
    green: "border-green-200 bg-green-50 text-green-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    pink: "border-pink-200 bg-pink-50 text-pink-700",
  };
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border",
        colors[color]
      )}
    >
      {children}
    </span>
  );
}
function getPhotoUrl(photo: any, apiKey: string, maxHeight = 300) {
  if (!photo?.name) return null;
  return `https://places.googleapis.com/v1/${photo.name}/media?key=${apiKey}&maxHeightPx=${maxHeight}`;
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="h-40 w-full animate-pulse bg-gray-200" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [cuisine, setCuisine] = useState("");
  const [radius, setRadius] = useState(2000);
  const [openNow, setOpenNow] = useState(false);
  const [minRating, setMinRating] = useState(4.0);
  const [dietary, setDietary] = useState<"veg" | "nonveg" | "both">("both");
  const [services, setServices] = useState<ServicePrefs>({});
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [ai, setAi] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  // Anywhere search
  const [locationQuery, setLocationQuery] = useState("");
  const [chosenPlace, setChosenPlace] = useState<string | null>(null);
  const [topK, setTopK] = useState(5);

  const getLocation = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setChosenPlace(null);
      },
      (e) => alert("Location error: " + e.message),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const setLocationByName = async () => {
    const q = locationQuery.trim();
    if (!q) return alert("Type a city, area, or landmark");
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Geocode failed");
      setCoords({ lat: json.lat, lng: json.lng });
      setChosenPlace(json.formatted || q);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const search = async () => {
    if (!coords) return alert("Please set your location");
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: coords.lat,
          lng: coords.lng,
          radiusMeters: radius,
          openNow,
          minRating,
          cuisine,
          dietary,
          services,
          topK,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const upstreamMsg =
          json?.upstream?.error?.message ||
          json?.upstream?.message ||
          json?.upstream?.detail ||
          json?.error ||
          "Unknown error";
        throw new Error(`(${json?.upstreamStatus || res.status}) ${upstreamMsg}`);
      }

      setResults(json.results || []);
      setAi(json.ai || null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const locationLabel = useMemo(() => {
    if (!coords) return "";
    if (chosenPlace) return chosenPlace;
    return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  }, [coords, chosenPlace]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-blue-50">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-tr from-pink-500 to-red-500 text-white font-bold">
              🍽️
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-gray-900">Best Resto</div>
              <div className="text-[11px] text-gray-500">Find places you’ll love</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={getLocation}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Use my location
            </button>
            <a
              href="#search"
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Search
            </a>
          </div>
        </div>
      </header>

      {/* Hero Search */}
      <section id="search" className="mx-auto max-w-6xl px-5 pt-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-md">
          {/* Ensure all tiles align: 12 columns total */}
          <div className="grid gap-3 md:grid-cols-12 md:items-end">
            {/* Location (5/12) */}
            <div className="md:col-span-5">
              <label className="text-xs font-medium text-gray-600">Location</label>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-400">
                <span className="text-gray-400">🔍</span>
                <input
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  className="h-11 w-full bg-transparent text-gray-800 outline-none placeholder:text-gray-400"
                  placeholder='Try "Baner Pune" or "Connaught Place Delhi"'
                />
                <button
                  onClick={setLocationByName}
                  className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Set
                </button>
              </div>
              {!!locationLabel && (
                <div className="mt-1 text-[12px] text-gray-500">📍 {locationLabel}</div>
              )}
            </div>

            {/* Cuisine (3/12) */}
            <div className="md:col-span-3">
              <label className="text-xs font-medium text-gray-600">Cuisine / Keyword</label>
              <input
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-pink-50 px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-pink-300"
                placeholder='e.g. "biryani"'
              />
            </div>

            {/* TopK (2/12) */}
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">Top results</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-indigo-50 px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-indigo-300"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
              >
                {[5, 10, 15, 20].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* CTA (2/12) */}
            <div className="md:col-span-2">
              <button
                onClick={search}
                disabled={loading || !coords}
                className="h-11 w-full rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-green-600 hover:to-emerald-700 disabled:opacity-50"
              >
                {loading ? "Searching..." : `Find Top ${topK}`}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Filters (sticky bar) */}
      <section className="sticky top-[64px] z-20 mt-4 border-y border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 px-5 py-3 md:grid-cols-12">
          {/* Radius (5/12) */}
          <div className="md:col-span-5">
            <label className="text-xs font-medium text-gray-600">Radius</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={500}
                max={8000}
                step={100}
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
              <span className="w-20 text-right text-sm text-gray-700">
                {Math.round(radius)} m
              </span>
            </div>
          </div>

          {/* Min rating (2/12) */}
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Min rating</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-yellow-50 px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-yellow-300"
              value={minRating}
              onChange={(e) => setMinRating(parseFloat(e.target.value))}
            >
              {[5, 4.5, 4, 3.5, 3, 0].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "Any" : v.toFixed(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Open now (2/12) */}
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Open now</label>
            <div className="mt-1 flex h-11 items-center rounded-xl border border-gray-300 bg-green-50 px-3">
              <input
                type="checkbox"
                checked={openNow}
                onChange={(e) => setOpenNow(e.target.checked)}
                className="accent-green-600"
              />
              <span className="ml-2 text-sm text-gray-800">Only show open</span>
            </div>
          </div>

          {/* Dietary (2/12) */}
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600">Dietary</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-300 bg-purple-50 px-3 text-sm text-gray-800 outline-none transition focus:ring-2 focus:ring-purple-300 hover:border-purple-400"
              value={dietary}
              onChange={(e) => setDietary(e.target.value as any)}
            >
              <option value="both">Both</option>
              <option value="veg">Veg only</option>
              <option value="nonveg">Non-veg</option>
            </select>
          </div>


          {/* Services (1/12 → expanded to 3/12 for balance) */}
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-gray-600">Services</label>
            <div className="mt-1 grid h-11 grid-cols-3 items-center gap-3 rounded-xl border border-gray-300 bg-indigo-50 px-3 text-sm">
              <label className="flex items-center gap-2 text-indigo-700">
                <input
                  type="checkbox"
                  className="accent-indigo-600"
                  checked={!!services.delivery}
                  onChange={(e) =>
                    setServices((s) => ({ ...s, delivery: e.target.checked }))
                  }
                />
                Delivery
              </label>
              <label className="flex items-center gap-2 text-pink-700">
                <input
                  type="checkbox"
                  className="accent-pink-600"
                  checked={!!services.dineIn}
                  onChange={(e) =>
                    setServices((s) => ({ ...s, dineIn: e.target.checked }))
                  }
                />
                Dine-in
              </label>
              <label className="flex items-center gap-2 text-yellow-700">
                <input
                  type="checkbox"
                  className="accent-yellow-500"
                  checked={!!services.takeout}
                  onChange={(e) =>
                    setServices((s) => ({ ...s, takeout: e.target.checked }))
                  }
                />
                Takeout
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-6xl px-5 py-6">
        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <div className="text-4xl">🔍</div>
            <h3 className="mt-2 text-lg font-semibold text-gray-800">Search great places</h3>
            <p className="mt-1 text-sm text-gray-600">
              Set a location and hit <span className="font-medium">Find Top {topK}</span>.
            </p>
          </div>
        )}

        {loading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {results.map((p: any, i: number) => {
              const title = p.displayName?.text || p.displayName;
              const addr = p.shortFormattedAddress;
              const rating = p.rating ?? "—";
              const reviews = p.userRatingCount ?? 0;
              const price = (p.priceLevel || "PRICE_LEVEL_UNSPECIFIED").replace(
                "PRICE_LEVEL_",
                "₹ "
              );

              return (
                <article
                  key={p.id}
                  className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
                >
                  {/* Header gradient as placeholder for future photos */}
                  {/* Image header */}
                  <div className="relative h-40 w-full overflow-hidden">
                    {p.photos && p.photos.length > 0 ? (
                      <img src={getPhotoUrl(p.photos[0], process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!) ?? ""}
                        alt={p.displayName?.text || "Restaurant photo"}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-blue-100 to-indigo-200" />
                    )}

                    {/* ranking badge */}
                    <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-800 shadow">
                      #{i + 1}
                    </div>

                    {/* badges */}
                    <div className="absolute bottom-3 left-3 flex gap-2">
                      {p?.currentOpeningHours?.openNow && (
                        <Badge color="green">🟢 Open now</Badge>
                      )}
                      {p.servesVegetarianFood && (
                        <Badge color="green">🥗 Veg options</Badge>
                      )}
                    </div>
                  </div>


                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="line-clamp-1 text-base font-semibold text-gray-900">
                          {title}
                        </h3>
                        <p className="mt-0.5 line-clamp-1 text-sm text-gray-600">{addr}</p>
                      </div>
                      <a
                        href={p.googleMapsUri}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100"
                      >
                        Maps
                      </a>
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-sm text-gray-800">
                      <span>⭐ {rating}</span>
                      <span className="text-gray-400">•</span>
                      <span>({reviews})</span>
                      <span className="text-gray-400">•</span>
                      <span>{price}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {p.delivery && <Badge color="blue">🚚 Delivery</Badge>}
                      {p.dineIn && <Badge color="pink">🍽️ Dine-in</Badge>}
                      {p.takeout && <Badge color="yellow">🛍️ Takeout</Badge>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {ai?.rationale && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-800">Why these picks</div>
            <p className="mt-1 text-sm text-gray-700">{ai.rationale}</p>
          </div>
        )}

        <footer className="mt-10 mb-6 text-xs text-gray-500">
          Place data © Google — presented via Places API.
        </footer>
      </section>
    </main>
  );
}
