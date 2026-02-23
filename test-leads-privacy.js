const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Transport Requests Privacy ---');

    // Find a transporter user
    const transporterProfile = await prisma.transporterProfile.findFirst({
        include: { user: true }
    });

    if (!transporterProfile) {
        console.log('No transporter profile found.');
        return;
    }

    const userId = transporterProfile.userId;
    console.log(`Testing for Transporter User: ${transporterProfile.user.name} (${userId})`);

    // We need to call the service method directly or mock the request
    // For simplicity, let's just see what's in the DB and what the logic WOULD do
    const requests = await prisma.transportRequest.findMany({
        where: { transporterId: transporterProfile.id },
        include: {
            farmer: { select: { name: true, phoneNumber: true } }
        }
    });

    if (requests.length === 0) {
        console.log('No requests found for this transporter.');
        return;
    }

    requests.forEach(req => {
        const showPhone = ['SCHEDULED', 'ACCEPTED', 'COMPLETED'].includes(req.status);
        console.log(`Request ID: ${req.id}`);
        console.log(`  Status: ${req.status}`);
        console.log(`  Farmer: ${req.farmer.name}`);
        console.log(`  Phone in DB: ${req.farmer.phoneNumber}`);
        console.log(`  Phone Revealed: ${showPhone ? req.farmer.phoneNumber : '[REDACTED]'}`);
        console.log('---');
    });
}

main().finally(() => prisma.$disconnect());
