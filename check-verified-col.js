const { PrismaClient } = require('@prisma/client');
async function main() {
    const prisma = new PrismaClient();
    try {
        const transporterCols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'TransporterProfile'
    `;
        console.log('TransporterProfile COLUMNS:', transporterCols.map(c => c.column_name));

        const userCols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'User'
    `;
        console.log('User COLUMNS:', userCols.map(c => c.column_name));
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
