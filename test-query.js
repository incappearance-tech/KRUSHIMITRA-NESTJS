const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  const params = ['RENT'];
  const sql = `
    SELECT m.*, u.name as "owner_name", u."locationLat" as "owner_lat", u."locationLng" as "owner_lng"
    FROM "Machine" m
    JOIN "User" u ON m."ownerId" = u.id
    WHERE m.status = 'AVAILABLE' AND m."listingType" = $1::"ListingType"
  `;
  const res = await prisma.$queryRawUnsafe(sql, ...params);
  console.log(res);
}
test().finally(() => prisma.$disconnect());
