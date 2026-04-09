"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const prisma = new client_1.PrismaClient();
const getRandomLat = () => 18.0 + Math.random() * 2.5;
const getRandomLng = () => 73.0 + Math.random() * 2.0;
const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
async function main() {
    console.log('Generating dummy data...');
    const LABOUR_COUNT = 1000;
    const TRANSPORTER_COUNT = 1000;
    const labourUsers = [];
    const labourProfiles = [];
    const transporterUsers = [];
    const transporterProfiles = [];
    const vehicles = [];
    const skillsList = ['Ploughing (Nangarni)', 'Harvesting (Katni/Kapni)', 'General Labour', 'Sowing (Perani)', 'Spraying'];
    const vehicleTypes = ['Tractor', 'Truck', 'Harvester', 'JCB', 'Pickup'];
    const models = ['Mahindra', 'John Deere', 'Swaraj', 'Tata Ace', 'Eicher'];
    for (let i = 0; i < LABOUR_COUNT; i++) {
        const userId = (0, uuid_1.v4)();
        const lat = getRandomLat();
        const lng = getRandomLng();
        const phone = `9000${i.toString().padStart(6, '0')}`;
        labourUsers.push({
            id: userId,
            phoneNumber: phone,
            name: `Labour ${i + 1}`,
            role: client_1.UserRole.LABOUR,
            locationLat: lat,
            locationLng: lng,
            locationAddress: 'Test Location',
            isVerified: true,
            privacyConsent: true,
        });
        labourProfiles.push({
            id: (0, uuid_1.v4)(),
            userId: userId,
            skills: [getRandomItem(skillsList), getRandomItem(skillsList)],
            experience: `${Math.floor(Math.random() * 10) + 1} Years`,
            pricePerDay: Math.floor(Math.random() * 500) + 300,
            workPreference: 'Day',
            isAvailable: true,
            rating: +(Math.random() * 2 + 3).toFixed(1),
            lat,
            lng,
        });
    }
    for (let i = 0; i < TRANSPORTER_COUNT; i++) {
        const userId = (0, uuid_1.v4)();
        const lat = getRandomLat();
        const lng = getRandomLng();
        const phone = `8000${i.toString().padStart(6, '0')}`;
        const transporterId = (0, uuid_1.v4)();
        transporterUsers.push({
            id: userId,
            phoneNumber: phone,
            name: `Transporter ${i + 1}`,
            role: client_1.UserRole.TRANSPORTER,
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
        const numVehicles = Math.random() > 0.5 ? 2 : 1;
        for (let v = 0; v < numVehicles; v++) {
            vehicles.push({
                id: (0, uuid_1.v4)(),
                transporterId: transporterId,
                type: getRandomItem(vehicleTypes),
                model: getRandomItem(models),
                capacity: `${Math.floor(Math.random() * 10) + 2} Tons`,
                ratePerKm: Math.floor(Math.random() * 50) + 20,
                isAvailable: true,
                images: ['https://cdn-icons-png.flaticon.com/512/3135/3135715.png'],
                operatingArea: 'Test Area',
                rating: +(Math.random() * 2 + 3).toFixed(1),
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
//# sourceMappingURL=seed-dummy-data.js.map