const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const profiles = await prisma.transporterProfile.findMany({
        include: { user: true, vehicles: true }
    });
    console.log(JSON.stringify(profiles, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
