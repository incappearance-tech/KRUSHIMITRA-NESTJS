const { PrismaClient } = require('@prisma/client');
async function main() {
    const prisma = new PrismaClient();
    try {
        const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'LabourProfile'
    `;
        console.log('COLUMNS:', columns);
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
