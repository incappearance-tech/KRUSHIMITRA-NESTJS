import { PrismaClient, UserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// Helper to generate random coordinates roughly in Maharashtra
const getRandomLat = () => 18.0 + Math.random() * 2.5; // 18.0 to 20.5
const getRandomLng = () => 73.0 + Math.random() * 2.0; // 73.0 to 75.0

// Helper to get random item
const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function main() {
    console.log('Generating dummy data...');

    const LABOUR_COUNT = 1000;
    const TRANSPORTER_COUNT = 1000;

    const labourUsers: any[] = [];
    const labourProfiles: any[] = [];

    const transporterUsers: any[] = [];
    const transporterProfiles: any[] = [];
    const vehicles: any[] = [];

    const skillsList = ['Ploughing (Nangarni)', 'Harvesting (Katni/Kapni)', 'General Labour', 'Sowing (Perani)', 'Spraying'];
    const vehicleTypes = ['Tractor', 'Truck', 'Harvester', 'JCB', 'Pickup'];
    const models = ['Mahindra', 'John Deere', 'Swaraj', 'Tata Ace', 'Eicher'];

    // --- Generate Labour Data ---
    for (let i = 0; i < LABOUR_COUNT; i++) {
        const userId = uuidv4();
        const lat = getRandomLat();
        const lng = getRandomLng();
        const phone = `9000${i.toString().padStart(6, '0')}`; // 9000000001

        labourUsers.push({
            id: userId,
            phoneNumber: phone,
            name: `Labour ${i + 1}`,
            role: UserRole.LABOUR,
            locationLat: lat,
            locationLng: lng,
            locationAddress: 'Test Location',
            isVerified: true,
            privacyConsent: true,
        });

        labourProfiles.push({
            id: uuidv4(),
            userId: userId,
            skills: [getRandomItem(skillsList), getRandomItem(skillsList)],
            experience: `${Math.floor(Math.random() * 10) + 1} Years`,
            pricePerDay: Math.floor(Math.random() * 500) + 300,
            workPreference: 'Day',
            isAvailable: true,
            rating: +(Math.random() * 2 + 3).toFixed(1), // 3.0 to 5.0
            lat,
            lng,
        });
    }

    // --- Generate Transporter Data ---
    for (let i = 0; i < TRANSPORTER_COUNT; i++) {
        const userId = uuidv4();
        const lat = getRandomLat();
        const lng = getRandomLng();
        const phone = `8000${i.toString().padStart(6, '0')}`; // 8000000001
        const transporterId = uuidv4();

        transporterUsers.push({
            id: userId,
            phoneNumber: phone,
            name: `Transporter ${i + 1}`,
            role: UserRole.TRANSPORTER,
            locationLat: lat,
            locationLng: lng,
            locationAddress: 'Test Location',
            isVerified: true,
            privacyConsent: true,
        });

        transporterProfiles.push({
            id: transporterId,
            userId: userId,
            businessName: `Transport Biz ${i + 1}`,
            operatingRadius: 100,
            experience: `${Math.floor(Math.random() * 15) + 1} Years`,
            lat,
            lng,
        });

        // Add 1 or 2 vehicles per transporter
        const numVehicles = Math.random() > 0.5 ? 2 : 1;
        for (let v = 0; v < numVehicles; v++) {
            vehicles.push({
                id: uuidv4(),
                transporterId: transporterId,
                type: getRandomItem(vehicleTypes),
                model: getRandomItem(models),
                capacity: `${Math.floor(Math.random() * 10) + 2} Tons`,
                ratePerKm: Math.floor(Math.random() * 50) + 20,
                isAvailable: true,
                images: ['https://cdn-icons-png.flaticon.com/512/3135/3135715.png'],
                operatingArea: 'Test Area',
                rating: +(Math.random() * 2 + 3).toFixed(1), // 3.0 to 5.0
            });
        }
    }

    console.log('Inserting Labour Users...');
    await prisma.user.createMany({ data: labourUsers, skipDuplicates: true });
    console.log('Inserting Labour Profiles...');
    await prisma.labourProfile.createMany({ data: labourProfiles, skipDuplicates: true });

    console.log('Inserting Transporter Users...');
    await prisma.user.createMany({ data: transporterUsers, skipDuplicates: true });
    console.log('Inserting Transporter Profiles...');
    await prisma.transporterProfile.createMany({ data: transporterProfiles, skipDuplicates: true });
    console.log(`Inserting ${vehicles.length} Vehicles...`);
    await prisma.vehicle.createMany({ data: vehicles, skipDuplicates: true });

    console.log('Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
