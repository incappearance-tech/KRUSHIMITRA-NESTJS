/**
 * KrushiMitra — Rent Out & Rent In Complete Scenario Seed
 *
 * Covers every card state in Rent Out inventory and every card/filter
 * in the Rent In browse screen.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TEST PHONES  (OTP = 123456 for all in dev mode)               │
 * ├────────────────────┬────────────────────────────────────────────┤
 * │  9100000001        │  Owner Farmer  — sees Rent Out inventory  │
 * │  9100000002        │  Borrower A    — uses Rent In to browse   │
 * │  9100000003        │  Borrower B    — has existing requests    │
 * └────────────────────┴────────────────────────────────────────────┘
 *
 * Run:
 *   npx ts-node prisma/seed-rent-machines.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Time helpers ──────────────────────────────────────────────────────────────
const now         = new Date();
const daysAgo     = (n: number) => new Date(now.getTime() - n * 86_400_000);
const daysLater   = (n: number) => new Date(now.getTime() + n * 86_400_000);

// ── Location helpers (Pune region — machines appear in nearby search) ─────────
// All machines clustered around Pune so they appear in each other's radius
const BASE = { lat: 18.5204, lng: 73.8567 };
const geo  = (offsetLat = 0, offsetLng = 0) => ({
  lat: BASE.lat + offsetLat,
  lng: BASE.lng + offsetLng,
});

// ── Upsert user ───────────────────────────────────────────────────────────────
async function upsertUser(phone: string, name: string) {
  return prisma.user.upsert({
    where:  { phoneNumber: phone },
    update: { name, role: 'FARMER', locationLat: BASE.lat, locationLng: BASE.lng },
    create: {
      phoneNumber:      phone,
      name,
      role:             'FARMER',
      locationLat:      BASE.lat,
      locationLng:      BASE.lng,
      isVerified:       true,
      privacyConsent:   true,
      consentTimestamp: now,
      preferredLanguage:'hi',
    },
  });
}

// ── Create machine ────────────────────────────────────────────────────────────
async function createMachine(data: {
  ownerId:      string;
  category:     string;
  brand:        string;
  model:        string;
  price:        number;
  pricingUnit:  'PER_HOUR' | 'PER_DAY' | 'PER_ACRE';
  isNegotiable: boolean;
  status:       'AVAILABLE' | 'IN_RENT' | 'WAITING_PAYMENT';
  plan:         string | null;
  planExpiresAt: Date | null;
  busyDates:    Date[];
  lat:          number;
  lng:          number;
  images:       string[];
}) {
  // Delete existing to allow clean re-seed
  await prisma.machine.deleteMany({
    where: { ownerId: data.ownerId, brand: data.brand, model: data.model },
  });
  return prisma.machine.create({
    data: {
      ownerId:       data.ownerId,
      category:      data.category,
      brand:         data.brand,
      model:         data.model,
      yearOfPurchase: 2021,
      listingType:   'RENT',
      price:         data.price,
      pricingUnit:   data.pricingUnit,
      images:        data.images,
      status:        data.status,
      isNegotiable:  data.isNegotiable,
      plan:          data.plan,
      planExpiresAt: data.planExpiresAt,
      busyDates:     data.busyDates,
      lat:           data.lat,
      lng:           data.lng,
    },
  });
}

// ── Create rental request ─────────────────────────────────────────────────────
async function createRequest(data: {
  machineId:    string;
  borrowerId:   string;
  ownerId:      string;
  startDate:    Date;
  numberOfDays: number;
  pricePerDay:  number;
  status:       'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  note?:        string;
  rejectReason?: string;
}) {
  await prisma.rentalRequest.deleteMany({
    where: {
      machineId:  data.machineId,
      borrowerId: data.borrowerId,
      status:     data.status,
    },
  });
  return prisma.rentalRequest.create({
    data: {
      machineId:    data.machineId,
      borrowerId:   data.borrowerId,
      ownerId:      data.ownerId,
      startDate:    data.startDate,
      numberOfDays: data.numberOfDays,
      pricePerDay:  data.pricePerDay,
      totalPrice:   data.pricePerDay * data.numberOfDays,
      status:       data.status,
      note:         data.note,
      rejectReason: data.rejectReason,
      respondedAt:  ['ACCEPTED','REJECTED'].includes(data.status) ? daysAgo(1) : null,
      completedAt:  data.status === 'COMPLETED' ? daysAgo(1) : null,
    },
  });
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🌱  Rent Machine Scenario Seed\n');

  // ── Users ─────────────────────────────────────────────────────────────────
  console.log('👤  Creating users...');
  const owner     = await upsertUser('+919100000001', 'Ramesh Patil (Owner)');
  const borrowerA = await upsertUser('+919100000002', 'Suresh Deshmukh');
  const borrowerB = await upsertUser('+919100000003', 'Kavita Jadhav');
  console.log('    ✓ 9100000001 — Owner Farmer (Rent Out inventory)');
  console.log('    ✓ 9100000002 — Borrower A  (Rent In browse)');
  console.log('    ✓ 9100000003 — Borrower B  (has existing requests)\n');

  // ════════════════════════════════════════════════════════════════════════════
  // RENT OUT INVENTORY — all 7 card states
  // ════════════════════════════════════════════════════════════════════════════
  console.log('🚜  Creating machines for Rent Out (9100000001 inventory)...\n');

  // ── 1. FREE PLAN — no expiry, always green ─────────────────────────────────
  const mFree = await createMachine({
    ownerId:      owner.id,
    category:     'Tractor',
    brand:        'Mahindra',
    model:        '575 DI (Free)',
    price:        150,
    pricingUnit:  'PER_HOUR',
    isNegotiable: false,
    status:       'AVAILABLE',
    plan:         'free',
    planExpiresAt: null,
    busyDates:    [],
    ...geo(0, 0),
    images: [],
  });
  console.log('    ✓ [FREE PLAN]       Mahindra 575 DI — ₹150/hr, always active');

  // ── 2. PAID PLAN ACTIVE — plenty of time left ─────────────────────────────
  const mActive = await createMachine({
    ownerId:      owner.id,
    category:     'Harvester',
    brand:        'Kubota',
    model:        'DC-70G (Active)',
    price:        500,
    pricingUnit:  'PER_DAY',
    isNegotiable: true,
    status:       'AVAILABLE',
    plan:         'basic',
    planExpiresAt: daysLater(45),
    busyDates:    [daysLater(3), daysLater(4)],  // 2 busy days set
    ...geo(0.01, 0.01),
    images: [],
  });
  console.log('    ✓ [ACTIVE PLAN]     Kubota DC-70G — ₹500/day, expires in 45 days, negotiable, 2 busy dates');

  // ── 3. EXPIRING SOON — within 7 days (amber warning) ─────────────────────
  const mWarn = await createMachine({
    ownerId:      owner.id,
    category:     'Sprayer',
    brand:        'Aspee',
    model:        'HTP-21 (Expiring)',
    price:        80,
    pricingUnit:  'PER_HOUR',
    isNegotiable: false,
    status:       'AVAILABLE',
    plan:         'basic',
    planExpiresAt: daysLater(5),  // ← 5 days left = warning
    busyDates:    [],
    ...geo(0.02, -0.01),
    images: [],
  });
  console.log('    ✓ [EXPIRING SOON]   Aspee HTP-21 — plan expires in 5 days (amber warning)');

  // ── 4. PLAN EXPIRED — red card, Renew Plan button ────────────────────────
  const mExpired = await createMachine({
    ownerId:      owner.id,
    category:     'Plough',
    brand:        'Sonalika',
    model:        'Tiger DI 75 (Expired)',
    price:        120,
    pricingUnit:  'PER_HOUR',
    isNegotiable: false,
    status:       'AVAILABLE',
    plan:         'basic',
    planExpiresAt: daysAgo(10),  // ← 10 days ago = expired
    busyDates:    [],
    ...geo(-0.01, 0.02),
    images: [],
  });
  console.log('    ✓ [EXPIRED PLAN]    Sonalika Tiger — plan expired 10 days ago (red, Renew button)');

  // ── 5. IN_RENT — currently rented out (blue badge) ───────────────────────
  const mInRent = await createMachine({
    ownerId:      owner.id,
    category:     'Tractor',
    brand:        'Swaraj',
    model:        '744 FE (In Rent)',
    price:        200,
    pricingUnit:  'PER_DAY',
    isNegotiable: false,
    status:       'IN_RENT',
    plan:         'pro',
    planExpiresAt: daysLater(60),
    busyDates:    [],
    ...geo(0.03, 0.03),
    images: [],
  });
  console.log('    ✓ [IN_RENT]         Swaraj 744 FE — currently rented (blue badge)');

  // ── 6. HIDDEN — owner hid it manually (purple badge) ────────────────────
  const mHidden = await createMachine({
    ownerId:      owner.id,
    category:     'Harvester',
    brand:        'John Deere',
    model:        'W50 (Hidden)',
    price:        800,
    pricingUnit:  'PER_DAY',
    isNegotiable: true,
    status:       'WAITING_PAYMENT',  // + planExpiresAt = hidden by owner
    plan:         'pro',
    planExpiresAt: daysLater(30),
    busyDates:    [],
    ...geo(-0.02, -0.02),
    images: [],
  });
  console.log('    ✓ [HIDDEN]          John Deere W50 — hidden by owner (purple, visibility-off icon)');

  // ── 7. PAYMENT PENDING — farmer didn't pay yet (yellow badge) ────────────
  const mPending = await createMachine({
    ownerId:      owner.id,
    category:     'Rotavator',
    brand:        'Fieldking',
    model:        'BGRNC-200 (Pay Pending)',
    price:        100,
    pricingUnit:  'PER_HOUR',
    isNegotiable: false,
    status:       'WAITING_PAYMENT',  // no planExpiresAt = payment pending
    plan:         null,
    planExpiresAt: null,
    busyDates:    [],
    ...geo(0.04, -0.03),
    images: [],
  });
  console.log('    ✓ [PAY PENDING]     Fieldking BGRNC — payment not done (yellow, Pay Now button)');

  // ── 8. PER_ACRE pricing — different pricing unit ─────────────────────────
  const mPerAcre = await createMachine({
    ownerId:      owner.id,
    category:     'Sprayer',
    brand:        'Indo Farm',
    model:        'IF-401 DT (Per Acre)',
    price:        60,
    pricingUnit:  'PER_ACRE',
    isNegotiable: true,
    status:       'AVAILABLE',
    plan:         'free',
    planExpiresAt: null,
    busyDates:    [],
    ...geo(0.05, 0.02),
    images: [],
  });
  console.log('    ✓ [PER_ACRE]        Indo Farm IF-401 — ₹60/acre (different unit)');

  console.log('\n    Summary: 8 machines created for owner 9100000001');
  console.log('    All 4 card variants visible: available / in-rent / hidden / pay-pending');
  console.log('    Plan states: free / active / expiring-soon / expired\n');

  // ════════════════════════════════════════════════════════════════════════════
  // RENT IN BROWSE — extra machines owned by Borrower B for variety
  // (These appear in the public browse for Borrower A / Owner)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('🔍  Creating extra machines for Rent In browse (owned by 9100000003)...\n');

  const mTractor2 = await createMachine({
    ownerId:      borrowerB.id,
    category:     'Tractor',
    brand:        'New Holland',
    model:        '3630 TX Super',
    price:        180,
    pricingUnit:  'PER_HOUR',
    isNegotiable: false,
    status:       'AVAILABLE',
    plan:         'basic',
    planExpiresAt: daysLater(30),
    busyDates:    [daysLater(1), daysLater(2)],
    ...geo(0.06, 0.04),
    images: [],
  });
  console.log('    ✓ New Holland 3630 TX — Tractor, ₹180/hr, busy next 2 days');

  const mSeeder = await createMachine({
    ownerId:      borrowerB.id,
    category:     'Seeder',
    brand:        'Khedut',
    model:        'Zero Till Drill',
    price:        250,
    pricingUnit:  'PER_DAY',
    isNegotiable: true,
    status:       'AVAILABLE',
    plan:         'pro',
    planExpiresAt: daysLater(80),
    busyDates:    [],
    ...geo(-0.03, 0.05),
    images: [],
  });
  console.log('    ✓ Khedut Zero Till Drill — Seeder, ₹250/day, negotiable');

  const mPump = await createMachine({
    ownerId:      borrowerB.id,
    category:     'Pump',
    brand:        'Kirloskar',
    model:        'Star-1 (5HP)',
    price:        40,
    pricingUnit:  'PER_HOUR',
    isNegotiable: false,
    status:       'AVAILABLE',
    plan:         'free',
    planExpiresAt: null,
    busyDates:    [],
    ...geo(0.07, -0.05),
    images: [],
  });
  console.log('    ✓ Kirloskar Star-1 — Pump, ₹40/hr');

  const mCultivator = await createMachine({
    ownerId:      borrowerB.id,
    category:     'Cultivator',
    brand:        'Shaktiman',
    model:        'Rigid Tyne 9',
    price:        90,
    pricingUnit:  'PER_HOUR',
    isNegotiable: true,
    status:       'AVAILABLE',
    plan:         'basic',
    planExpiresAt: daysLater(20),
    busyDates:    [daysLater(5), daysLater(6), daysLater(7)],
    ...geo(-0.04, -0.04),
    images: [],
  });
  console.log('    ✓ Shaktiman Rigid Tyne 9 — Cultivator, ₹90/hr, 3 busy dates set');

  // Machine NOT visible in browse (IN_RENT)
  await createMachine({
    ownerId:      borrowerB.id,
    category:     'Thresher',
    brand:        'Punjab',
    model:        'Paddy Thresher (In Use)',
    price:        300,
    pricingUnit:  'PER_DAY',
    isNegotiable: false,
    status:       'IN_RENT',          // ← won't show in browse (filtered out)
    plan:         'basic',
    planExpiresAt: daysLater(25),
    busyDates:    [],
    ...geo(0.08, 0.06),
    images: [],
  });
  console.log('    ✓ Punjab Paddy Thresher — IN_RENT (hidden from browse, tests filter)');

  console.log('\n    Summary: 5 extra machines (4 browsable + 1 IN_RENT to test filtering)\n');

  // ════════════════════════════════════════════════════════════════════════════
  // RENTAL REQUESTS — all 5 statuses
  // (Borrower A sending requests to Owner's machines)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('📋  Creating rental requests (all 5 statuses)...\n');

  // PENDING — borrower just sent, owner hasn't responded
  const rPending = await createRequest({
    machineId:    mActive.id,
    borrowerId:   borrowerA.id,
    ownerId:      owner.id,
    startDate:    daysLater(5),
    numberOfDays: 2,
    pricePerDay:  500,
    status:       'PENDING',
    note:         'Need for wheat harvesting. Will pick up from your farm.',
  });
  console.log('    ✓ PENDING  — Kubota DC-70G, 5 days from now (2 days), note attached');

  // ACCEPTED — owner approved, farmer should see "Call Owner"
  const rAccepted = await createRequest({
    machineId:    mFree.id,
    borrowerId:   borrowerA.id,
    ownerId:      owner.id,
    startDate:    daysLater(3),
    numberOfDays: 1,
    pricePerDay:  150,
    status:       'ACCEPTED',
    note:         'For ploughing 2 acres',
  });
  console.log('    ✓ ACCEPTED — Mahindra 575 DI, 3 days from now (1 day)');

  // REJECTED — owner declined with reason
  const rRejected = await createRequest({
    machineId:    mWarn.id,
    borrowerId:   borrowerA.id,
    ownerId:      owner.id,
    startDate:    daysLater(2),
    numberOfDays: 1,
    pricePerDay:  80,
    status:       'REJECTED',
    note:         'Need for spraying',
    rejectReason: 'Machine already booked for that date by another farmer.',
  });
  console.log('    ✓ REJECTED — Aspee HTP-21, 2 days from now, reason given');

  // COMPLETED — rental finished
  const rCompleted = await createRequest({
    machineId:    mActive.id,
    borrowerId:   borrowerA.id,
    ownerId:      owner.id,
    startDate:    daysAgo(7),
    numberOfDays: 3,
    pricePerDay:  500,
    status:       'COMPLETED',
    note:         'Used for harvesting soyabean field',
  });
  console.log('    ✓ COMPLETED — Kubota DC-70G, 7 days ago (3 days), done');

  // CANCELLED — borrower cancelled before response
  const rCancelled = await createRequest({
    machineId:    mPerAcre.id,
    borrowerId:   borrowerA.id,
    ownerId:      owner.id,
    startDate:    daysLater(10),
    numberOfDays: 2,
    pricePerDay:  60,
    status:       'CANCELLED',
    note:         'Changed plans, no longer need',
  });
  console.log('    ✓ CANCELLED — Indo Farm IF-401, 10 days from now, borrower cancelled\n');

  // Borrower B also has requests — for "My Requests" tab variety
  await createRequest({
    machineId:    mTractor2.id,
    borrowerId:   borrowerB.id,
    ownerId:      borrowerB.id,
    startDate:    daysLater(8),
    numberOfDays: 1,
    pricePerDay:  180,
    status:       'PENDING',
    note:         'Need New Holland for field preparation',
  });
  await createRequest({
    machineId:    mSeeder.id,
    borrowerId:   owner.id,
    ownerId:      borrowerB.id,
    startDate:    daysLater(12),
    numberOfDays: 2,
    pricePerDay:  250,
    status:       'ACCEPTED',
  });
  console.log('    ✓ Extra PENDING  request — Borrower B pending on New Holland');
  console.log('    ✓ Extra ACCEPTED request — Owner borrowing Khedut Seeder from B\n');

  // ════════════════════════════════════════════════════════════════════════════
  // Machine Categories (ensures browse chips work)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('📦  Upserting machine categories...');
  const cats = [
    { name: 'Tractor',    icon: 'agriculture'  },
    { name: 'Harvester',  icon: 'eco'          },
    { name: 'Sprayer',    icon: 'sanitizer'    },
    { name: 'Plough',     icon: 'agriculture'  },
    { name: 'Rotavator',  icon: 'agriculture'  },
    { name: 'Seeder',     icon: 'grass'        },
    { name: 'Thresher',   icon: 'agriculture'  },
    { name: 'Pump',       icon: 'water'        },
    { name: 'Cultivator', icon: 'agriculture'  },
    { name: 'Other',      icon: 'handyman'     },
  ];
  for (const c of cats) {
    await prisma.machineCategory.upsert({
      where:  { name: c.name },
      update: { icon: c.icon, isActive: true },
      create: { name: c.name, icon: c.icon, isActive: true },
    });
  }
  console.log(`    ✓ ${cats.length} categories ready\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // Final Summary
  // ════════════════════════════════════════════════════════════════════════════
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║         RENT MACHINE SEED COMPLETE                               ║
╠═══════════════════════════════════════════════════════════════════╣
║  OTP for all phones: 123456                                       ║
╠═══════════════════╦═══════════════════════════════════════════════╣
║  9100000001       ║  Owner — login to test RENT OUT inventory     ║
║  9100000002       ║  Borrower A — login to test RENT IN browse    ║
║  9100000003       ║  Borrower B — extra machines & requests       ║
╠═══════════════════╩═══════════════════════════════════════════════╣
║  RENT OUT  — 8 machines                                          ║
║   ✓ FREE PLAN          — no expiry, always green                 ║
║   ✓ ACTIVE (paid)      — 45 days left, basic plan               ║
║   ✓ EXPIRING SOON      — 5 days left (amber warning)            ║
║   ✓ EXPIRED            — 10 days ago (red, Renew button)        ║
║   ✓ IN_RENT            — currently rented (blue badge)          ║
║   ✓ HIDDEN             — owner hid it (purple badge)            ║
║   ✓ PAYMENT PENDING    — didn't pay (yellow, Pay Now button)    ║
║   ✓ PER_ACRE pricing   — different unit display                  ║
╠═══════════════════════════════════════════════════════════════════╣
║  RENT IN   — 9 machines visible in browse                        ║
║   ✓ Tractor × 2, Harvester, Sprayer × 2, Plough                 ║
║   ✓ Seeder, Pump, Cultivator                                     ║
║   ✓ 1 IN_RENT machine (filtered out of browse)                   ║
║   ✓ Machines with busy dates set (availability calendar)         ║
║   ✓ Negotiable + non-negotiable prices                           ║
║   ✓ PER_HOUR, PER_DAY, PER_ACRE units                           ║
╠═══════════════════════════════════════════════════════════════════╣
║  RENTAL REQUESTS — all 5 statuses                                ║
║   ✓ PENDING    ✓ ACCEPTED   ✓ REJECTED (with reason)            ║
║   ✓ COMPLETED  ✓ CANCELLED                                       ║
╚═══════════════════════════════════════════════════════════════════╝
`);
}

main()
  .catch(e => { console.error('\n❌  Seed failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
