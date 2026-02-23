const { LabourService } = require('./src/modules/labour/labour.service');
const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    const service = new LabourService(prisma);

    try {
        const result = await service.findAll(undefined, undefined, 50, 1, 15, undefined, ['Harvesting'], undefined, undefined);
        console.log('SUCCESS:', result.data.length, 'RESULTS');
    } catch (e) {
        console.error('--- ERROR ---', e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
