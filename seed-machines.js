/**
 * Seed 1000 Machine rows (listingType=RENT, status=AVAILABLE) for testing.
 * Run:  node seed-machines.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 }  = require('uuid');

const prisma = new PrismaClient();

const CATEGORIES = ['Tractor', 'Harvester', 'Sprayer', 'Plough', 'Seeder', 'Rotavator', 'Thresher', 'Pump', 'Cultivator'];

const BRANDS = {
  Tractor:    ['Mahindra', 'John Deere', 'Swaraj', 'New Holland', 'TAFE', 'Sonalika', 'Eicher', 'Kubota'],
  Harvester:  ['John Deere', 'Claas', 'Mahindra', 'Preet', 'Kartar'],
  Sprayer:    ['Aspee', 'Knapsack', 'Shakti', 'Indo Farm'],
  Plough:     ['Fieldking', 'Shaktimaan', 'Lemken', 'Sonalika'],
  Seeder:     ['Fieldking', 'Shaktimaan', 'John Deere', 'Maschio'],
  Rotavator:  ['Fieldking', 'Shaktimaan', 'Mahindra', 'Kubota'],
  Thresher:   ['Kartar', 'Kissan', 'Preet', 'Mahindra'],
  Pump:       ['Kirloskar', 'Texmo', 'CRI', 'Grundfos'],
  Cultivator: ['Fieldking', 'Shaktimaan', 'Sonalika', 'Lemken'],
};

const MODELS = {
  Tractor:    ['575 DI', '265 DI', '8085', '5310', 'JIVO 245', '750', '312', '5050 D'],
  Harvester:  ['W70', 'Tucano 320', 'ARJUN 605', '9120', '4455'],
  Sprayer:    ['16L Knapsack', 'Power Sprayer 20L', '30L Battery', '12L Manual'],
  Plough:     ['MB 3F', 'Disc 9F', 'Chisel 7F', 'Reversible 4F'],
  Seeder:     ['Zero-Till 9F', 'Raised Bed 6R', 'Planter 4R', 'Multicrop 7F'],
  Rotavator:  ['165 cm', '180 cm', '210 cm', '135 cm'],
  Thresher:   ['Multi Crop 4000', 'Paddy 3000', 'Wheat 3500', 'Mini 2000'],
  Pump:       ['3 HP Mono', '5 HP Centrifugal', '7.5 HP Submersible', '10 HP Diesel'],
  Cultivator: ['7 Tyne', '9 Tyne', '11 Tyne', 'Spring 7F'],
};

const PRICING_UNITS = ['PER_HOUR', 'PER_DAY', 'PER_ACRE'];

const PRICE_RANGES = {
  Tractor:    [400, 1200],
  Harvester:  [1500, 4000],
  Sprayer:    [100, 400],
  Plough:     [200, 600],
  Seeder:     [300, 800],
  Rotavator:  [400, 900],
  Thresher:   [500, 1500],
  Pump:       [150, 500],
  Cultivator: [250, 700],
};

const IMAGES = [
  'https://images.unsplash.com/photo-1619451334792-150fd785ee74?w=400',
  'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400',
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400',
  'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400',
  'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
  'https://images.unsplash.com/photo-1589923188900-a02be6e8f12b?w=400',
  'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400',
  'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400',
];

// Maharashtra clusters with ~0.5° jitter
const CLUSTERS = [
  { lat: 18.52, lng: 73.86 },  // Pune
  { lat: 19.99, lng: 73.79 },  // Nashik
  { lat: 19.88, lng: 75.34 },  // Aurangabad
  { lat: 21.14, lng: 79.08 },  // Nagpur
  { lat: 16.70, lng: 74.24 },  // Kolhapur
  { lat: 17.67, lng: 75.90 },  // Solapur
  { lat: 20.00, lng: 77.30 },  // Akola
  { lat: 18.40, lng: 76.58 },  // Latur
];

const rand     = (arr) => arr[Math.floor(Math.random() * arr.length)];
const jitter   = (v, r) => v + (Math.random() - 0.5) * r;
const randInt  = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
const randPrc  = (cat) => { const [lo, hi] = PRICE_RANGES[cat]; return randInt(lo, hi); };

async function main() {
  console.log('🌱  Fetching FARMER users...');

  const farmers = await prisma.user.findMany({
    where: { role: 'FARMER', locationLat: { not: null } },
    select: { id: true, locationLat: true, locationLng: true },
    take: 500,
  });

  if (!farmers.length) {
    console.error('❌  No FARMER users found. Run seed-dummy-data first.');
    process.exit(1);
  }
  console.log(`✅  ${farmers.length} farmers found. Seeding 1000 machines...`);

  const now       = new Date();
  const in30      = new Date(now.getTime() + 30  * 86400000);
  const in60      = new Date(now.getTime() + 60  * 86400000);
  const in90      = new Date(now.getTime() + 90  * 86400000);
  const in7       = new Date(now.getTime() +  7  * 86400000);
  const expired   = new Date(now.getTime() -  2  * 86400000);
  const expiries  = [in30, in30, in60, in90, in7, null]; // weighted: mostly active

  const BATCH = 100;
  const TOTAL = 1000;
  let   done  = 0;

  for (let b = 0; b < TOTAL / BATCH; b++) {
    const rows = [];
    for (let i = 0; i < BATCH; i++) {
      const farmer   = farmers[(b * BATCH + i) % farmers.length];
      const cluster  = rand(CLUSTERS);
      const category = rand(CATEGORIES);
      const brand    = rand(BRANDS[category]);
      const model    = rand(MODELS[category]);
      const unit     = rand(PRICING_UNITS);
      const expiry   = rand(expiries);

      // Spread locations across Maharashtra using cluster + farmer location
      const useFarmer = Math.random() > 0.4;
      const lat = jitter(useFarmer ? (farmer.locationLat ?? cluster.lat) : cluster.lat, 0.6);
      const lng = jitter(useFarmer ? (farmer.locationLng ?? cluster.lng) : cluster.lng, 0.6);

      rows.push({
        id:            uuidv4(),
        ownerId:       farmer.id,
        category,
        brand,
        model,
        yearOfPurchase: randInt(2010, 2023),
        listingType:   'RENT',
        price:         randPrc(category),
        pricingUnit:   unit,
        isNegotiable:  Math.random() > 0.5,
        status:        'AVAILABLE',
        plan:          rand(['monthly', 'quarterly', 'yearly', null]),
        planExpiresAt: expiry,
        images:        [rand(IMAGES)],
        lat,
        lng,
        busyDates:     [],
        createdAt:     new Date(now.getTime() - randInt(0, 90) * 86400000), // up to 90 days ago
        updatedAt:     now,
      });
    }

    await prisma.machine.createMany({ data: rows });
    done += rows.length;
    process.stdout.write(`\r   ${done} / ${TOTAL} inserted...`);
  }

  const total = await prisma.machine.count({ where: { listingType: 'RENT' } });
  console.log(`\n✅  Done! Total RENT machines in DB: ${total}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
