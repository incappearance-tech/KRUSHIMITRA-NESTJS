const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Farmer Requests (Transporter Privacy) ---');

    // Find a farmer user
    const farmer = await prisma.user.findFirst({
        where: { role: 'FARMER' }
    });

    if (!farmer) {
        console.log('No farmer user found.');
        return;
    }

    console.log(`Testing for Farmer User: ${farmer.name} (${farmer.id})`);

    // Mocking the getFarmerRequests service logic
    const requests = await prisma.transportRequest.findMany({
        where: { farmerId: farmer.id },
        include: {
            vehicle: {
                include: {
                    transporter: {
                        include: { user: { select: { name: true, phoneNumber: true } } }
                    }
                }
            }
        }
    });

    if (requests.length === 0) {
        console.log('No requests found for this farmer.');
        return;
    }

    requests.forEach(req => {
        const showTransporterPhone = ['SCHEDULED', 'ACCEPTED', 'COMPLETED'].includes(req.status);
        console.log(`Request ID: ${req.id}`);
        console.log(`  Status: ${req.status}`);
        console.log(`  Transporter: ${req.vehicle.transporter.user.name}`);
        console.log(`  Phone in DB: ${req.vehicle.transporter.user.phoneNumber}`);
        console.log(`  Phone Revealed: ${showTransporterPhone ? req.vehicle.transporter.user.phoneNumber : '[REDACTED]'}`);
        console.log('---');
    });
}

main().finally(() => prisma.$disconnect());
