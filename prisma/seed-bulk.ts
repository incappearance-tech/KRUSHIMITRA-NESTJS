/**
 * KrushiMitra — Bulk Search & Pagination Test Data
 *
 * Seeds 1000 records per browsable entity:
 *   • 1000 Labour profiles   (varied skills, prices, locations, ratings)
 *   • 1000 Vehicles          (varied types, rates, active subscriptions)
 *   •  500 Machines          (sell + rent, all categories, varied plans)
 *   •  500 Materials         (varied crops, spread across Maharashtra)
 *
 * Phone ranges (safe — no conflict with e2e accounts +91910XXXXXX):
 *   Labour     : +917100000001 – +917100001000
 *   Transporter: +917200000001 – +917200000500
 *   Farmer     : +917300000001 – +917300000200
 *
 * Usage: npm run seed:bulk
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

// ─── Maharashtra realistic coordinate spread ──────────────────────────────────
const REGIONS = [
  { name: 'Pune',       lat: 18.52, lng: 73.86 },
  { name: 'Nashik',     lat: 19.99, lng: 73.79 },
  { name: 'Aurangabad', lat: 19.87, lng: 75.34 },
  { name: 'Nagpur',     lat: 21.14, lng: 79.08 },
  { name: 'Kolhapur',   lat: 16.70, lng: 74.23 },
  { name: 'Solapur',    lat: 17.68, lng: 75.90 },
  { name: 'Amravati',   lat: 20.94, lng: 77.75 },
  { name: 'Nanded',     lat: 19.16, lng: 77.32 },
  { name: 'Satara',     lat: 17.68, lng: 74.00 },
  { name: 'Ahmednagar', lat: 19.09, lng: 74.73 },
];

// Jitter within ~30km of each region centre
const jitter = () => (Math.random() - 0.5) * 0.5;
const randomCoords = () => {
  const r = REGIONS[Math.floor(Math.random() * REGIONS.length)];
  return { lat: +(r.lat + jitter()).toFixed(4), lng: +(r.lng + jitter()).toFixed(4) };
};

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T>(arr: T[], n: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
};
const ratingBetween = (min: number, max: number) =>
  +(Math.random() * (max - min) + min).toFixed(1);
const intBetween = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const future = (days: number) => new Date(Date.now() + days * 86400000);

// ─────────────────────────────────────────────────────────────────────────────
// Domain constants
// ─────────────────────────────────────────────────────────────────────────────
const SKILLS = [
  'Ploughing (Nangarni)', 'Harvesting (Katni/Kapni)', 'Transplanting (Ropani)',
  'Weeding (Nindai/Khurpi)', 'Spraying (Fawarani)', 'Cotton Picking',
  'Sugarcane Cutting', 'Threshing', 'General Labour', 'Loading/Unloading (Hamali)',
  'Dairy Farming', 'Fencing', 'Other',
];

const VEHICLE_TYPES = [
  'Tractor Trolley', 'Mini Truck', 'Large Truck', 'Pickup Van',
  'Tempo', 'Tata Ace', 'Vikram Auto', 'Bullock Cart',
];

const VEHICLE_MODELS: Record<string, string[]> = {
  'Tractor Trolley': ['Mahindra 575 + Trolley', 'John Deere 5310 + Trolley', 'Swaraj 744 + Trolley'],
  'Mini Truck':      ['Tata Ace Gold', 'Mahindra Jeeto', 'Piaggio Ape'],
  'Large Truck':     ['Eicher Pro 3015', 'Tata 1109', 'Ashok Leyland 2516'],
  'Pickup Van':      ['Mahindra Bolero Pickup', 'Tata Yodha', 'Isuzu D-Max'],
  'Tempo':           ['Tempo Traveller', 'Force Traveller', 'Bajaj RE'],
  'Tata Ace':        ['Tata Ace HT', 'Tata Ace EX', 'Tata Super Ace'],
  'Vikram Auto':     ['Vikram 410G', 'Vikram 3W', 'Piaggio 3W'],
  'Bullock Cart':    ['Traditional Cart', 'Rubber Tyre Cart', 'Metal Cart'],
};

const MACHINE_CATEGORIES: { name: string; brands: string[]; priceRent: [number, number]; priceSell: [number, number] }[] = [
  { name: 'Tractor',    brands: ['Mahindra', 'John Deere', 'Swaraj', 'TAFE', 'Sonalika'], priceRent: [800, 1500], priceSell: [300000, 900000] },
  { name: 'Harvester',  brands: ['John Deere', 'New Holland', 'CLAAS'],                    priceRent: [1500, 3000], priceSell: [1500000, 4000000] },
  { name: 'Rotavator',  brands: ['Fieldking', 'Shaktiman', 'Lemken'],                      priceRent: [500, 900],   priceSell: [50000, 120000] },
  { name: 'Sprayer',    brands: ['Aspee', 'Stihl', 'KisanKraft'],                          priceRent: [400, 800],   priceSell: [15000, 60000] },
  { name: 'Seed Drill', brands: ['Fieldking', 'Beri', 'Maschio'],                          priceRent: [600, 1100],  priceSell: [40000, 100000] },
  { name: 'Thresher',   brands: ['Shaktiman', 'Mahindra', 'Dasmesh'],                      priceRent: [700, 1200],  priceSell: [60000, 150000] },
  { name: 'Plough',     brands: ['Fieldking', 'Lemken', 'Khedut'],                         priceRent: [300, 600],   priceSell: [8000, 30000] },
  { name: 'Cultivator', brands: ['Fieldking', 'Shaktiman', 'Sonalika'],                    priceRent: [400, 700],   priceSell: [12000, 40000] },
  { name: 'Water Pump', brands: ['Kirloskar', 'Grundfos', 'Honda'],                        priceRent: [200, 500],   priceSell: [5000, 25000] },
  { name: 'Baler',      brands: ['New Holland', 'John Deere', 'CLAAS'],                    priceRent: [1000, 2000], priceSell: [400000, 900000] },
];

const MATERIALS = [
  'Wheat (Gehu)', 'Rice (Chawal)', 'Soybean (Soyabin)', 'Cotton (Kapas)',
  'Sugarcane (Ganna)', 'Onion (Kanda)', 'Tomato (Tamatar)', 'Potato (Aalu)',
  'Maize (Makka)', 'Jowar (Sorghum)', 'Bajra (Pearl Millet)', 'Turmeric (Haldi)',
  'Pomegranate (Anar)', 'Grapes (Angoor)', 'Banana (Kela)', 'Mango (Aam)',
  'Cow Dung Manure', 'Vermi Compost', 'Organic Fertilizer', 'Neem Cake',
];

const LABOUR_NAMES = [
  'Ramesh', 'Suresh', 'Mahesh', 'Ganesh', 'Nilesh', 'Yogesh', 'Rajesh', 'Dinesh',
  'Santosh', 'Prakash', 'Vishnu', 'Shivaji', 'Balu', 'Tukaram', 'Pandhari', 'Mahadev',
  'Kisan', 'Arjun', 'Bhimrao', 'Dattatray', 'Gajanan', 'Hanumant', 'Ishwar', 'Jagannath',
];
const SURNAMES = [
  'Patil', 'Shinde', 'More', 'Jadhav', 'Pawar', 'Bhosale', 'Gaikwad', 'Kale',
  'Deshmukh', 'Mane', 'Chavan', 'Salve', 'Yadav', 'Kamble', 'Thorat', 'Deshpande',
];
const TRANSPORTER_NAMES = [
  'Ajay', 'Vijay', 'Sanjay', 'Abhijit', 'Nitin', 'Sunil', 'Anil', 'Milind',
  'Prasad', 'Deepak', 'Umesh', 'Naresh', 'Prashant', 'Sandeep', 'Amol', 'Sachin',
];
const FARMER_NAMES = [
  'Balasaheb', 'Dattatray', 'Vishwanath', 'Narayan', 'Shankar', 'Govind',
  'Bhagwan', 'Dhondiba', 'Maruti', 'Hari', 'Tukaram', 'Pandurang',
];

const randomName = () => `${pick(LABOUR_NAMES)} ${pick(SURNAMES)}`;
const transporterName = (i: number) => `${pick(TRANSPORTER_NAMES)} ${pick(SURNAMES)} Logistics`;
const farmerName = () => `${pick(FARMER_NAMES)} ${pick(SURNAMES)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Chunked insert helper
// ─────────────────────────────────────────────────────────────────────────────
async function insertChunks<T>(
  items: T[],
  chunkSize: number,
  insertFn: (chunk: T[]) => Promise<any>,
  label: string,
) {
  let done = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    await insertFn(items.slice(i, i + chunkSize));
    done = Math.min(i + chunkSize, items.length);
    process.stdout.write(`\r  ${label}: ${done}/${items.length}`);
  }
  console.log(`\r  ✓ ${label}: ${items.length} records`);
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedLabour(count = 1000) {
  console.log(`\n👷  Seeding ${count} Labour profiles...`);

  const users: any[] = [];
  const profiles: any[] = [];

  for (let i = 1; i <= count; i++) {
    const id  = uuid();
    const { lat, lng } = randomCoords();
    const skills = pickN(SKILLS, intBetween(1, 3));
    const price  = intBetween(300, 1200);

    users.push({
      id,
      phoneNumber: `+91710${i.toString().padStart(7, '0')}`,
      name:        randomName(),
      role:        'LABOUR',
      locationLat: lat,
      locationLng: lng,
      isVerified:  true,
      privacyConsent: true,
      consentTimestamp: new Date(),
    });

    profiles.push({
      id:            uuid(),
      userId:        id,
      skills,
      experience:    `${intBetween(1, 15)} Years`,
      pricePerDay:   price,
      workPreference: pick(['Day', 'Night', 'Both']),
      isAvailable:   Math.random() > 0.15,  // 85% available
      rating:        ratingBetween(3.0, 5.0),
      jobsCompleted: intBetween(0, 80),
      lat,
      lng,
    });
  }

  await insertChunks(users, 200, (c) =>
    prisma.user.createMany({ data: c, skipDuplicates: true }), 'Labour users');
  await insertChunks(profiles, 200, (c) =>
    prisma.labourProfile.createMany({ data: c, skipDuplicates: true }), 'Labour profiles');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedTransportersAndVehicles(transporterCount = 500) {
  console.log(`\n🚛  Seeding ${transporterCount} transporters × 2 vehicles = ${transporterCount * 2} vehicles...`);

  const tUsers:    any[] = [];
  const tProfiles: any[] = [];
  const vehicles:  any[] = [];
  const payments:  any[] = [];
  const subs:      any[] = [];

  for (let i = 1; i <= transporterCount; i++) {
    const userId  = uuid();
    const profId  = uuid();
    const { lat, lng } = randomCoords();

    tUsers.push({
      id: userId,
      phoneNumber: `+91720${i.toString().padStart(7, '0')}`,
      name:        transporterName(i),
      role:        'TRANSPORTER',
      locationLat: lat,
      locationLng: lng,
      isVerified:  true,
      privacyConsent: true,
      consentTimestamp: new Date(),
    });

    tProfiles.push({
      id:             profId,
      userId,
      businessName:   `${transporterName(i)} — ${REGIONS[i % REGIONS.length].name}`,
      operatingRadius: intBetween(50, 300),
      experience:     `${intBetween(1, 20)} Years`,
      lat,
      lng,
    });

    // 2 vehicles per transporter
    const vehicleTypes = pickN(VEHICLE_TYPES, 2);
    for (const vType of vehicleTypes) {
      const vId    = uuid();
      const models = VEHICLE_MODELS[vType] ?? ['Standard Model'];
      const model  = pick(models);
      const expiryDays = pick([25, 30, 60, 90, 180]); // varied subscription lengths
      const plan   = expiryDays <= 30 ? 'monthly' : expiryDays <= 90 ? 'quarterly' : 'yearly';
      const amount = plan === 'monthly' ? 499 : plan === 'quarterly' ? 1199 : 3999;
      const expiry = future(expiryDays);
      const payId  = uuid();

      vehicles.push({
        id:            vId,
        transporterId: profId,
        type:          vType,
        model,
        numberPlate:   `MH${intBetween(10, 47).toString().padStart(2, '0')}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${intBetween(1000, 9999)}`,
        capacity:      `${intBetween(1, 15)} Tons`,
        ratePerKm:     intBetween(10, 50),
        isAvailable:   Math.random() > 0.1,  // 90% available
        driverName:    randomName(),
        driverPhone:   `+91${intBetween(7000000000, 9999999999)}`,
        plan,
        expiryDate:    expiry,
        rating:        ratingBetween(3.0, 5.0),
        tripCount:     intBetween(0, 120),
        locationLat:   lat + jitter() * 0.1,
        locationLng:   lng + jitter() * 0.1,
        images:        [`https://picsum.photos/seed/${encodeURIComponent(vType.replace(/\s+/g, ''))}/400/300`],
      });

      payments.push({
        id:               payId,
        userId,
        type:             'VEHICLE_SUBSCRIPTION',
        feature:          'VEHICLE_SUBSCRIPTION',
        amount,
        status:           'PAID',
        paymentMethod:    'UPI',
        entityId:         vId,
        entityType:       'VEHICLE',
        razorpayOrderId:  `bulk_order_${vId.slice(0, 8)}`,
        razorpayPaymentId:`bulk_pay_${vId.slice(0, 8)}`,
      });

      subs.push({
        userId,
        paymentId:        payId,
        subscriptionType: 'VEHICLE_PLAN',
        entityId:         vId,
        entityType:       'VEHICLE',
        vehicleId:        vId,
        plan,
        startDate:        past(30 - expiryDays > 0 ? 30 : 5),
        endDate:          expiry,
        renewalCount:     intBetween(0, 3),
      });
    }
  }

  await insertChunks(tUsers,    200, (c) => prisma.user.createMany({ data: c, skipDuplicates: true }), 'Transporter users');
  await insertChunks(tProfiles, 200, (c) => prisma.transporterProfile.createMany({ data: c, skipDuplicates: true }), 'Transporter profiles');
  await insertChunks(vehicles,  200, (c) => prisma.vehicle.createMany({ data: c, skipDuplicates: true }), 'Vehicles');
  await insertChunks(payments,  200, (c) => prisma.payment.createMany({ data: c, skipDuplicates: true }), 'Vehicle payments');
  await insertChunks(subs,      200, (c) => prisma.subscription.createMany({ data: c, skipDuplicates: true }), 'Vehicle subscriptions');
}

const past = (days: number) => new Date(Date.now() - days * 86400000);

// ─────────────────────────────────────────────────────────────────────────────
async function seedMachines(farmerCount = 100, machinesEach = 5) {
  const total = farmerCount * machinesEach;
  console.log(`\n🚜  Seeding ${farmerCount} farmers × ${machinesEach} machines = ${total} machines...`);

  const fUsers:   any[] = [];
  const machines: any[] = [];

  for (let i = 1; i <= farmerCount; i++) {
    const userId = uuid();
    const { lat, lng } = randomCoords();

    fUsers.push({
      id:          userId,
      phoneNumber: `+91730${i.toString().padStart(7, '0')}`,
      name:        farmerName(),
      role:        'FARMER',
      locationLat: lat,
      locationLng: lng,
      isVerified:  true,
      privacyConsent: true,
      consentTimestamp: new Date(),
    });

    for (let m = 0; m < machinesEach; m++) {
      const cat    = pick(MACHINE_CATEGORIES);
      const isRent = Math.random() > 0.4;  // 60% RENT, 40% SELL
      const [minP, maxP] = isRent ? cat.priceRent : cat.priceSell;
      const price  = intBetween(minP, maxP);
      const plans  = ['free', 'basic', 'pro'];
      const plan   = pick(plans);
      const planDays = plan === 'free' ? 30 : plan === 'basic' ? 60 : 90;

      machines.push({
        id:            uuid(),
        ownerId:       userId,
        category:      cat.name,
        brand:         pick(cat.brands),
        model:         `${cat.name} ${intBetween(100, 999)}`,
        yearOfPurchase: intBetween(2015, 2024),
        listingType:   isRent ? 'RENT' : 'SELL',
        price,
        status:        'AVAILABLE',
        plan,
        planExpiresAt: future(planDays),
        lat:           lat + jitter() * 0.05,
        lng:           lng + jitter() * 0.05,
        pricingUnit:   isRent ? pick(['PER_HOUR', 'PER_DAY', 'PER_ACRE']) : 'PER_HOUR',
        isNegotiable:  Math.random() > 0.5,
        images:        [`https://picsum.photos/seed/${cat.name.replace(/\s+/g, '')}/400/300`],
      });
    }
  }

  await insertChunks(fUsers,   200, (c) => prisma.user.createMany({ data: c, skipDuplicates: true }), 'Farmer users');
  await insertChunks(machines, 200, (c) => prisma.machine.createMany({ data: c, skipDuplicates: true }), 'Machines');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedMaterials(count = 500) {
  console.log(`\n🌾  Seeding ${count} materials...`);

  // Reuse existing farmer users (first 100)
  const farmers = await prisma.user.findMany({
    where: { role: 'FARMER', phoneNumber: { startsWith: '+91730' } },
    select: { id: true },
    take: 100,
  });

  if (farmers.length === 0) {
    console.log('  ⚠ No bulk farmers found — run after seedMachines');
    return;
  }

  const mats: any[] = [];
  for (let i = 0; i < count; i++) {
    const farmer = pick(farmers);
    mats.push({
      farmerId:     farmer.id,
      materialName: pick(MATERIALS),
      photoUrl:     `https://picsum.photos/seed/${String(i + Math.floor(Math.random() * 1000))}/300/300`,
      expiresAt:    future(intBetween(5, 30)),
    });
  }

  await insertChunks(mats, 200, (c) => prisma.farmerMaterial.createMany({ data: c, skipDuplicates: true }), 'Materials');
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   KrushiMitra — Bulk Search & Pagination Seed');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   1000 Labour  |  1000 Vehicles  |  500 Machines  |  500 Materials\n');

  const t0 = Date.now();

  await seedLabour(1000);
  await seedTransportersAndVehicles(500);   // 500 transporters × 2 vehicles = 1000 vehicles
  await seedMachines(100, 5);               // 100 farmers × 5 machines = 500 machines
  await seedMaterials(500);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`   ✅  Done in ${secs}s`);
  console.log('\n   WHAT TO TEST:');
  console.log('   • Labour browse: search "Ploughing", "Cotton", "5 Years"');
  console.log('   • Labour filter: skills, price range, radius, min rating');
  console.log('   • Transport browse: filter by vehicle type, rate, radius');
  console.log('   • Machine browse: filter by category, brand, price range');
  console.log('   • Material search: "Wheat", "Onion", "Soybean"');
  console.log('   • Scroll all lists: pagination kicks in every 15 records');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
