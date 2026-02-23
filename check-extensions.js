const { PrismaClient } = require('@prisma/client');
async function main() {
    const prisma = new PrismaClient();
    try {
        const extensions = await prisma.$queryRaw`SELECT * FROM pg_extension`;
        console.log('EXTENSIONS:', extensions.map(e => e.extname));

        // Test similarity
        const sim = await prisma.$queryRaw`SELECT similarity('test', 'text')`;
        console.log('SIMILARITY TEST:', sim);
    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
