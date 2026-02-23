const { PrismaClient } = require('@prisma/client');
async function main() {
    const prisma = new PrismaClient();
    const skills = ['Harvesting'];
    const searchQuery = 'test';
    const limit = 15;
    const offset = 0;

    // Mirroring the logic in LabourService
    let paramIndex = 1;
    const params = [];
    const conditions = [];

    if (skills) {
        conditions.push(`p."skills" ?| $${paramIndex++}::text[]`);
        params.push(skills);
    }

    if (searchQuery) {
        conditions.push(`(
        similarity(p."experience", $${paramIndex}) > 0.3 OR 
        p."experience" ILIKE $${paramIndex + 1} OR 
        similarity(u."name", $${paramIndex}) > 0.3 OR
        u."name" ILIKE $${paramIndex + 1}
      )`);
        params.push(searchQuery);
        params.push(`%${searchQuery}%`);
        paramIndex += 2;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const sql = `
      SELECT p.*,
             u.id as "user_id", u.name as "user_name"
      FROM "LabourProfile" p
      JOIN "User" u ON p."userId" = u.id
      ${whereClause}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    try {
        console.log('SQL:', sql);
        console.log('PARAMS:', params);
        const result = await prisma.$queryRawUnsafe(sql, ...params);
        console.log('SUCCESS:', result.length);
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
