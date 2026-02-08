
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const LOCATIONS = [
    'Pune', 'Mumbai', 'Nashik', 'Nagpur', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded', 'Sangli',
    'Satara', 'Akola', 'Latur', 'Dhule', 'Ahmednagar', 'Chandrapur', 'Parbhani', 'Jalgaon', 'Bhusawal', 'Ratnagiri'
];

const FIRST_NAMES = [
    'Rahul', 'Amit', 'Suresh', 'Ramesh', 'Vijay', 'Sanjay', 'Manoj', 'Rajesh', 'Anil', 'Sunil',
    'Pooja', 'Priya', 'Sneha', 'Anita', 'Kavita', 'Sunita', 'Rekha', 'Meena', 'Rani', 'Suman',
    'Ganesh', 'Shiv', 'Krishna', 'Arjun', 'Vikas', 'Nitin', 'Sachin', 'Sagar', 'Vishal', 'Ajay'
];

const LAST_NAMES = [
    'Patil', 'Deshmukh', 'Jadhav', 'Shinde', 'Pawar', 'Kulkarni', 'Kale', 'More', 'Chavan', 'Gaikwad',
    'Bhosale', 'Sawant', 'Joshi', 'Kadam', 'Thakare', 'Shetty', 'Raut', 'Mane', 'Ghatge', 'Thorat'
];

const LABOUR_SKILLS = [
    'Harvesting', 'Ploughing', 'Sowing', 'Spraying', 'Weeding', 'Threshing', 'Irrigation', 'Fencing', 'Pruning'
];

const VEHICLE_TYPES = [
    'Tractor', 'Mini Truck', 'Pickup Van', 'Tempo', 'Truck', 'Trolley'
];

// Helper to get random item from array
const arrRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random number between min and max
const numRandom = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper to generate random Indian mobile number
const randomPhone = (): string => {
    const prefix = ['9', '8', '7', '6'][Math.floor(Math.random() * 4)];
    return prefix + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
};

// Helper to generate random Lat/Lng (approx Maharashtra bounds)
const randomLocation = () => ({
    lat: 18.0 + Math.random() * 3, // ~18.0 to 21.0
    lng: 73.0 + Math.random() * 4, // ~73.0 to 77.0
    address: arrRandom(LOCATIONS)
});

// Helper to get multiple random skills
const randomSkills = (): string[] => {
    const count = numRandom(1, 4);
    // Create a copy before sorting to avoid mutating the constant array (though sort is in-place)
    const shuffled = [...LABOUR_SKILLS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

async function main() {
    console.log('🌱 Starting seed...');

    // --- SEED TRANSPORTERS (100) ---
    console.log('🚛 Seeding 100 Transporters...');
    let transporterCount = 0;
    for (let i = 0; i < 100; i++) {
        const firstName = arrRandom(FIRST_NAMES);
        const lastName = arrRandom(LAST_NAMES);
        const name = `${firstName} ${lastName}`;
        const phone = randomPhone();
        const loc = randomLocation();

        try {
            await prisma.user.create({
                data: {
                    phoneNumber: phone,
                    name: name,
                    role: UserRole.TRANSPORTER,
                    locationLat: loc.lat,
                    locationLng: loc.lng,
                    locationAddress: loc.address,
                    isVerified: Math.random() > 0.2, // 80% verified
                    privacyConsent: true,
                    transporterProfile: {
                        create: {
                            businessName: `${lastName} Transport Services`,
                            operatingRadius: numRandom(20, 100),
                            experience: `${numRandom(1, 15)} Years`,
                            // vehicles relation
                            vehicles: {
                                create: Array.from({ length: numRandom(1, 3) }).map(() => ({
                                    type: arrRandom(VEHICLE_TYPES),
                                    model: 'Standard',
                                    numberPlate: `MH-${numRandom(10, 50)}-${String.fromCharCode(65 + numRandom(0, 25))}${String.fromCharCode(65 + numRandom(0, 25))}-${numRandom(1000, 9999)}`,
                                    capacity: `${numRandom(1, 10)} Tons`,
                                    ratePerKm: numRandom(15, 50), // Decimal handled as number/string
                                    isAvailable: Math.random() > 0.1,
                                    driverName: name,
                                    driverPhone: phone,
                                }))
                            }
                        }
                    }
                },
            });
            transporterCount++;
            if (transporterCount % 10 === 0) process.stdout.write('.');
        } catch (e) {
            // Ignore unique constraint violations if random phone collides
            // console.log('Skipping duplicate phone');
        }
    }
    console.log(`\nCreated ${transporterCount} Transporters`);

    // --- SEED LABOURERS (100) ---
    console.log('👨‍🌾 Seeding 100 Labourers...');
    let labourCount = 0;
    for (let i = 0; i < 100; i++) {
        const firstName = arrRandom(FIRST_NAMES);
        const lastName = arrRandom(LAST_NAMES);
        const name = `${firstName} ${lastName}`;
        const phone = randomPhone();
        const loc = randomLocation();

        try {
            await prisma.user.create({
                data: {
                    phoneNumber: phone,
                    name: name,
                    role: UserRole.LABOUR,
                    locationLat: loc.lat,
                    locationLng: loc.lng,
                    locationAddress: loc.address,
                    isVerified: Math.random() > 0.3, // 70% verified
                    privacyConsent: true,
                    labourProfile: {
                        create: {
                            skills: randomSkills(),
                            experience: `${numRandom(1, 20)} Years`,
                            pricePerDay: numRandom(300, 800),
                            workPreference: ['Day', 'Night', 'Both'][numRandom(0, 2)],
                            isAvailable: Math.random() > 0.1,
                            rating: Number((Math.random() * 2 + 3).toFixed(1)), // 3.0 to 5.0
                            jobsCompleted: numRandom(0, 500),
                            callsReceived: numRandom(0, 100),
                        }
                    }
                }
            });
            labourCount++;
            if (labourCount % 10 === 0) process.stdout.write('.');
        } catch (e) {
            // Ignore duplicates
        }
    }
    console.log(`\nCreated ${labourCount} Labourers`);

    console.log('✅ Seeding complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
