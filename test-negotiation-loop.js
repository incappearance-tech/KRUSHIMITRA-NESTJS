const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Testing Confirm Suggestion Flow & Notifications ---');

    // Find users
    const farmer = await prisma.user.findFirst({ where: { role: 'FARMER' } });
    const transporterProfile = await prisma.transporterProfile.findFirst({ include: { user: true, vehicles: true } });

    if (!farmer || !transporterProfile || transporterProfile.vehicles.length === 0) {
        console.log('Missing data for test. Run seed data first.');
        return;
    }

    const transporter = transporterProfile.user;
    const vehicle = transporterProfile.vehicles[0];

    console.log(`Farmer: ${farmer.name} (${farmer.id})`);
    console.log(`Transporter: ${transporter.name} (${transporter.id})`);

    // Create a new request
    let request = await prisma.transportRequest.create({
        data: {
            farmerId: farmer.id,
            vehicleId: vehicle.id,
            transporterId: transporterProfile.id,
            pickup: 'Mumbai',
            drop: 'Pune',
            crop: 'Alphonso Mango',
            quantity: '50 Boxes',
            requiredDate: new Date(),
            status: 'SENT',
        }
    });

    console.log(`Created Request ID: ${request.id}, Status: ${request.status}`);

    // Transporter suggests a new date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await prisma.transportRequest.update({
        where: { id: request.id },
        data: {
            suggestedDate: tomorrow,
        }
    });

    console.log(`Transporter suggested new date: ${tomorrow.toISOString()}`);

    // Farmer accepts suggestion
    // Emulate TransporterService logic
    request = await prisma.transportRequest.update({
        where: { id: request.id },
        data: {
            status: 'SCHEDULED',
            requiredDate: tomorrow
        }
    });

    console.log(`Farmer Accepted! New Status: ${request.status}, Required Date: ${request.requiredDate.toISOString()}`);

    // Farmer cancels the scheduled trip
    request = await prisma.transportRequest.update({
        where: { id: request.id },
        data: {
            status: 'CANCELLED',
            cancellationReason: 'Found another vehicle earlier',
            cancelledById: farmer.id
        }
    });

    console.log(`Farmer Cancelled! New Status: ${request.status}, Reason: ${request.cancellationReason}`);

    // Emulate what Transporter sees on dashboard
    const recentlyCancelledLeads = await prisma.transportRequest.findMany({
        where: {
            transporterId: transporterProfile.id,
            status: 'CANCELLED',
            updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        },
        include: { farmer: true }
    });

    console.log(`\nTransporter Dashboard - Recent Cancellations: ${recentlyCancelledLeads.length}`);
    recentlyCancelledLeads.forEach(l => {
        console.log(`- ${l.farmer.name} cancelled trip. Reason: ${l.cancellationReason}`);
    });

    console.log('--- Verification Complete ---');
}

main().finally(() => prisma.$disconnect());
