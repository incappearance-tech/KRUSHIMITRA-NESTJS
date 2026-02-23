const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Vehicles:', await prisma.vehicle.count());
    console.log('Vehicles with expiry:', await prisma.vehicle.count({ where: { expiryDate: { not: null } } }));
    console.log('Labour:', await prisma.labourProfile.count());

    // Fix the vehicles with no expiry date so they show up
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    const update = await prisma.vehicle.updateMany({
        where: { expiryDate: null },
        data: { expiryDate: oneYearFromNow, plan: 'yearly' }
    });
    console.log('Updated', update.count, 'vehicles with an expiry date.');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
