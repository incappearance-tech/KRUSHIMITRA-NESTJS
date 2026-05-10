/**
 * Seed 1000 FarmerMaterial rows for Buy Material testing.
 * Run:  node seed-materials.js
 *
 * Uses existing FARMER users in the DB; spreads materials across them
 * with realistic Maharashtra coordinates, names, and photos.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 }  = require('uuid');

const prisma = new PrismaClient();

// ── Material names (mix of Marathi + English common farm materials) ─────────
const MATERIAL_NAMES = [
  'शेणखत', 'वर्मी कंपोस्ट', 'गांडूळ खत', 'कोंबडी खत', 'हिरवळ खत',
  'राख', 'Organic Waste', 'Compost', 'सेंद्रिय खत', 'नीम खत',
  'गोमूत्र', 'जीवामृत', 'Cow Dung Manure', 'Poultry Manure', 'Vermi Compost',
  'Green Manure', 'Bio Compost', 'सुपर कंपोस्ट', 'कडुनिंब खत', 'ताकाचे पाणी',
  'शेणाचे गोळे', 'बायोगॅस स्लरी', 'Biogas Slurry', 'Ash Manure', 'फोसफेट खत',
];

// ── Placeholder photos (Unsplash free farming images) ─────────────────────
const PHOTOS = [
  'https://images.unsplash.com/photo-1589923188651-268a9765e432?w=400',
  'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
  'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400',
  'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=400',
  'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400',
  'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=400',
  'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400',
  'https://images.unsplash.com/photo-1592982537447-6f2a6a0a8b8e?w=400',
  'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=400',
  'https://images.unsplash.com/photo-1606761568499-6d2451b23c66?w=400',
];

// ── Maharashtra coordinate ranges ─────────────────────────────────────────
// Spread across Pune, Nashik, Aurangabad, Nagpur, Kolhapur districts
const LOCATION_CLUSTERS = [
  { lat: 18.52,  lng: 73.86,  name: 'Pune'       },
  { lat: 19.99,  lng: 73.79,  name: 'Nashik'     },
  { lat: 19.88,  lng: 75.34,  name: 'Aurangabad' },
  { lat: 21.14,  lng: 79.08,  name: 'Nagpur'     },
  { lat: 16.70,  lng: 74.24,  name: 'Kolhapur'   },
  { lat: 17.67,  lng: 75.90,  name: 'Solapur'    },
  { lat: 20.00,  lng: 77.30,  name: 'Akola'      },
  { lat: 21.46,  lng: 80.00,  name: 'Gondia'     },
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const jitter = (base, range) => base + (Math.random() - 0.5) * range;

async function main() {
  console.log('🌱  Fetching existing FARMER users...');

  // Get up to 500 farmers (we'll cycle through them for 1000 materials)
  const farmers = await prisma.user.findMany({
    where: { role: 'FARMER', locationLat: { not: null } },
    select: { id: true, locationLat: true, locationLng: true },
    take: 500,
  });

  if (farmers.length === 0) {
    console.error('❌  No FARMER users with location found. Run seed-dummy-data first.');
    process.exit(1);
  }

  console.log(`✅  Found ${farmers.length} farmers. Creating 1000 materials...`);

  const BATCH = 100;
  const TOTAL = 1000;
  let created = 0;

  const now         = new Date();
  const in30Days    = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const in60Days    = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
  const in7Days     = new Date(now.getTime() +  7 * 24 * 3600 * 1000);
  const minus3Days  = new Date(now.getTime() -  3 * 24 * 3600 * 1000); // expired

  const expiryOptions = [in30Days, in60Days, in7Days, minus3Days, in30Days, in30Days]; // weight active

  for (let b = 0; b < TOTAL / BATCH; b++) {
    const rows = [];
    for (let i = 0; i < BATCH; i++) {
      const farmer  = farmers[(b * BATCH + i) % farmers.length];
      const cluster = rand(LOCATION_CLUSTERS);

      // Occasionally override farmer location with a cluster jitter
      const lat = Math.random() > 0.5
        ? jitter(farmer.locationLat ?? cluster.lat, 0.3)
        : jitter(cluster.lat, 0.5);
      const lng = Math.random() > 0.5
        ? jitter(farmer.locationLng ?? cluster.lng, 0.3)
        : jitter(cluster.lng, 0.5);

      rows.push({
        id:           uuidv4(),
        farmerId:     farmer.id,
        materialName: rand(MATERIAL_NAMES),
        photoUrl:     rand(PHOTOS),
        expiresAt:    rand(expiryOptions),
        createdAt:    now,
        updatedAt:    now,
      });
    }

    await prisma.farmerMaterial.createMany({ data: rows });
    created += rows.length;
    process.stdout.write(`\r   ${created} / ${TOTAL} inserted...`);
  }

  const total = await prisma.farmerMaterial.count();
  console.log(`\n✅  Done! Total FarmerMaterial rows in DB: ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
