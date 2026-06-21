/**
 * geo.ts · Geolocalización por IP desde headers de Vercel.
 *
 * Vercel inyecta estos headers en cada request en producción/preview:
 *   x-vercel-ip-country         (ej. "CO")
 *   x-vercel-ip-country-region  (ej. "DC")
 *   x-vercel-ip-city            (NO se usa · minimización Ley 1581/2012)
 *
 * Granularidad país + región por decisión de minimización. En dev local los
 * headers no existen → null (no rompe nada).
 */
export interface Geo {
  country: string | null;
  region: string | null;
}

export function getGeo(request: Request): Geo {
  const h = request.headers;
  const country = h.get('x-vercel-ip-country')?.trim();
  const region = h.get('x-vercel-ip-country-region')?.trim();
  return {
    country: country ? country.slice(0, 8) : null,
    region: region ? region.slice(0, 16) : null,
  };
}
