const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  const params = [18.5902617, 73.7606002, 50, 'RENT'];
  const sql = `
    SELECT m.*, u.name as "owner_name", u."locationLat" as "owner_lat", u."locationLng" as "owner_lng",
      (
        6371 * 2 * asin(sqrt(
          pow(sin(radians(u."locationLat" - $1) / 2), 2) +
          cos(radians($1)) * cos(radians(u."locationLat")) *
          pow(sin(radians(u."locationLng" - $2) / 2), 2)
        ))
      ) as "distanceKm"
    FROM "Machine" m
    JOIN "User" u ON m."ownerId" = u.id
    WHERE m.status = 'AVAILABLE' 
      AND m."listingType" = $4::"ListingType"
      AND (
        6371 * 2 * asin(sqrt(
          pow(sin(radians(u."locationLat" - $1) / 2), 2) +
          cos(radians($1)) * cos(radians(u."locationLat")) *
          pow(sin(radians(u."locationLng" - $2) / 2), 2)
        ))
      ) <= $3
    ORDER BY "distanceKm" ASC NULLS LAST
  `;
  const res = await prisma.$queryRawUnsafe(sql, ...params);
  console.log(res);
}
test().finally(() => prisma.$disconnect());
