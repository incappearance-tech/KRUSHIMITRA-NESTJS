/**
 * Distance utilities — PostGIS (SQL) + Haversine (in-memory JS).
 *
 * PostGIS is used for all database queries:
 *   - ST_Distance(geography) is more accurate than the Haversine approximation
 *   - ST_DWithin(geography) can exploit GIST spatial indexes for 10-100× speed
 *   - Supabase enables PostGIS by default on all projects
 *
 * NOTE: ST_MakePoint takes (longitude, latitude) — GeoJSON / PostGIS convention.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PostGIS — use in raw SQL queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PostGIS distance expression in kilometres.
 *
 * @param lngCol  SQL expression for row longitude (e.g. 'u."locationLng"')
 * @param latCol  SQL expression for row latitude  (e.g. 'u."locationLat"')
 * @param pLng    Positional param placeholder for query longitude (e.g. '$1')
 * @param pLat    Positional param placeholder for query latitude  (e.g. '$2')
 *
 * Returns NULL when either the row or query coords are NULL.
 */
export function postgisDistanceKmSql(
  lngCol: string,
  latCol: string,
  pLng: string,
  pLat: string,
): string {
  return `(
    ST_Distance(
      geography(ST_MakePoint(${lngCol}, ${latCol})),
      geography(ST_MakePoint(${pLng}::float, ${pLat}::float))
    ) / 1000.0
  )`;
}

/**
 * PostGIS radius filter — true when the row is within radiusKm of the query point.
 * Converts km → metres internally (geography uses metres).
 *
 * When used with a GIST index on a geography column this is far faster than
 * computing ST_Distance for every row.  Without an index it is still more
 * accurate than Haversine SQL.
 *
 * @param pRadiusKm  Positional param placeholder for radius in km (e.g. '$3')
 */
export function postgisWithinSql(
  lngCol: string,
  latCol: string,
  pLng: string,
  pLat: string,
  pRadiusKm: string,
): string {
  return `ST_DWithin(
    geography(ST_MakePoint(${lngCol}, ${latCol})),
    geography(ST_MakePoint(${pLng}::float, ${pLat}::float)),
    ${pRadiusKm}::float * 1000.0
  )`;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory Haversine — use only for small result sets already in JS memory
// (e.g. tagging incoming-lead distances after fetching a handful of rows)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Haversine great-circle distance in km — pure JavaScript.
 * Do NOT use inside SQL queries; use postgisDistanceKmSql instead.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @deprecated Use postgisDistanceKmSql + postgisWithinSql instead.
 * Kept for reference only — do not add new usages.
 */
export function haversineSql(
  latCol: string,
  lngCol: string,
  pLat: string,
  pLng: string,
): string {
  return `(
    6371 * 2 * ASIN(SQRT(
      POWER(SIN((RADIANS(${latCol}) - RADIANS(${pLat}::float)) / 2), 2) +
      COS(RADIANS(${pLat}::float)) *
      COS(RADIANS(${latCol})) *
      POWER(SIN((RADIANS(${lngCol}) - RADIANS(${pLng}::float)) / 2), 2)
    ))
  )`;
}
