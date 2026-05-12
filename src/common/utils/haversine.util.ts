/**
 * Shared Haversine distance utilities — single source of truth.
 * Used by transporter, labour, and machine services.
 */

/**
 * Haversine great-circle distance in km — runs in application memory.
 * Use for small sets where SQL overhead is undesirable (e.g. incoming-job distance tagging).
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
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
 * SQL Haversine expression template — inlined into raw queries.
 * @param latCol  SQL column for row's latitude  (e.g. 'u."locationLat"')
 * @param lngCol  SQL column for row's longitude (e.g. 'u."locationLng"')
 * @param pLat    Positional param index for user lat  (e.g. '$1')
 * @param pLng    Positional param index for user lng  (e.g. '$2')
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
