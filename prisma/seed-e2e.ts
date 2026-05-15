/**
 * KrushiMitra — End-to-End Test Data Seed
 *
 * Creates realistic data for every role covering all scenarios.
 * Login with OTP 123456 (dev bypass) on any of the phone numbers below.
 *
 * ─────────────────────────────────────────────────────
 *  FARMER  :  +919100000001  Ramesh Patel     (full data)
 *             +919100000002  Suresh Sharma    (buyer / booker)
 *  LABOUR  :  +919100000011  Mohan Kamble     (all job statuses)
 *             +919100000012  Rajesh Yadav     (available, high rating)
 *  TRANSPORT: +919100000021  Ajay Logistics   (2 vehicles, all req statuses)
 *             +919100000022  Vijay Transport  (expired subscription)
 * ─────────────────────────────────────────────────────
 *
 * Usage:  npm run seed:e2e
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Fixed UUIDs so re-runs stay idempotent (upsert by phoneNumber) ──────────
const IDS = {
  // Farmers
  farmer1:   'e2e-farmer-1-000000000000000000000001',
  farmer2:   'e2e-farmer-2-000000000000000000000002',
  // Labour
  labour1:   'e2e-labour-1-000000000000000000000001',
  labour2:   'e2e-labour-2-000000000000000000000002',
  labProf1:  'e2e-labprof-1-00000000000000000000001',
  labProf2:  'e2e-labprof-2-00000000000000000000002',
  // Transporters
  trans1:    'e2e-trans-1-0000000000000000000000001',
  trans2:    'e2e-trans-2-0000000000000000000000002',
  tprof1:    'e2e-tprof-1-0000000000000000000000001',
  tprof2:    'e2e-tprof-2-0000000000000000000000002',
  vehicle1:  'e2e-vehicle-1-000000000000000000000001',
  vehicle2:  'e2e-vehicle-2-000000000000000000000002',
  vehicle3:  'e2e-vehicle-3-000000000000000000000003',
  // Machines
  machine1:  'e2e-machine-1-000000000000000000000001',
  machine2:  'e2e-machine-2-000000000000000000000002',
  machine3:  'e2e-machine-3-000000000000000000000003',
  machine4:  'e2e-machine-4-000000000000000000000004',
};

// ─── Coordinates — Maharashtra villages ───────────────────────────────────────
const COORDS = {
  farmer1:  { lat: 18.5204, lng: 73.8567 },   // Pune
  farmer2:  { lat: 19.0760, lng: 72.8777 },   // Mumbai
  labour1:  { lat: 18.6298, lng: 73.7997 },   // Pimpri
  labour2:  { lat: 18.4530, lng: 73.8674 },   // Hadapsar
  trans1:   { lat: 19.9975, lng: 73.7898 },   // Nashik
  trans2:   { lat: 21.1458, lng: 79.0882 },   // Nagpur
};

const future  = (days: number) => new Date(Date.now() + days * 86400000);
const past    = (days: number) => new Date(Date.now() - days * 86400000);
const dateStr = (d: Date)     => d.toISOString().split('T')[0];

async function upsertUser(data: {
  id: string; phoneNumber: string; name: string;
  role: string; lat: number; lng: number;
}) {
  return prisma.user.upsert({
    where:  { phoneNumber: data.phoneNumber },
    create: {
      id: data.id, phoneNumber: data.phoneNumber, name: data.name,
      role: data.role as any, locationLat: data.lat, locationLng: data.lng,
      isVerified: true, privacyConsent: true, consentTimestamp: new Date(),
    },
    update: {
      name: data.name, role: data.role as any,
      locationLat: data.lat, locationLng: data.lng,
      isVerified: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedFarmers() {
  console.log('\n👨‍🌾  Seeding farmers...');

  const f1 = await upsertUser({ id: IDS.farmer1, phoneNumber: '+919100000001',
    name: 'Ramesh Patel', role: 'FARMER', ...COORDS.farmer1 });

  const f2 = await upsertUser({ id: IDS.farmer2, phoneNumber: '+919100000002',
    name: 'Suresh Sharma', role: 'FARMER', ...COORDS.farmer2 });

  console.log(`  ✓ ${f1.name} (${f1.phoneNumber})`);
  console.log(`  ✓ ${f2.name} (${f2.phoneNumber})`);
  return { f1, f2 };
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedMachines(farmerId: string) {
  console.log('\n🚜  Seeding machines...');

  const machines = [
    {
      id: IDS.machine1, ownerId: farmerId,
      category: 'Tractor', brand: 'Mahindra', model: '575 DI',
      yearOfPurchase: 2020, listingType: 'SELL' as const,
      price: 450000, status: 'AVAILABLE' as const,
      plan: 'pro', planExpiresAt: future(90),
      lat: COORDS.farmer1.lat, lng: COORDS.farmer1.lng,
      pricingUnit: 'PER_HOUR', isNegotiable: true,
      images: ['https://picsum.photos/seed/mahindra575/400/300'],
    },
    {
      id: IDS.machine2, ownerId: farmerId,
      category: 'Harvester', brand: 'John Deere', model: 'W70',
      yearOfPurchase: 2019, listingType: 'RENT' as const,
      price: 1500, status: 'AVAILABLE' as const,
      plan: 'basic', planExpiresAt: future(60),
      lat: COORDS.farmer1.lat + 0.01, lng: COORDS.farmer1.lng + 0.01,
      pricingUnit: 'PER_HOUR', isNegotiable: false,
      images: ['https://picsum.photos/seed/jdw70/400/300'],
    },
    {
      id: IDS.machine3, ownerId: farmerId,
      category: 'Sprayer', brand: 'Swaraj', model: 'Sprayer 855',
      yearOfPurchase: 2021, listingType: 'RENT' as const,
      price: 800, status: 'IN_RENT' as const,
      plan: 'free', planExpiresAt: future(30),
      lat: COORDS.farmer1.lat + 0.02, lng: COORDS.farmer1.lng - 0.01,
      pricingUnit: 'PER_ACRE', isNegotiable: false,
      images: ['https://picsum.photos/seed/sprayer/400/300'],
    },
    {
      id: IDS.machine4, ownerId: farmerId,
      category: 'Rotavator', brand: 'Fieldking', model: 'Power Max',
      yearOfPurchase: 2018, listingType: 'SELL' as const,
      price: 85000, status: 'AVAILABLE' as const,
      plan: null, planExpiresAt: null,
      lat: COORDS.farmer1.lat - 0.01, lng: COORDS.farmer1.lng + 0.02,
      pricingUnit: 'PER_HOUR', isNegotiable: true,
      images: ['https://picsum.photos/seed/rotavator/400/300'],
    },
  ];

  for (const m of machines) {
    await prisma.machine.upsert({
      where: { id: m.id },
      create: m,
      update: { status: m.status, price: m.price, plan: m.plan, planExpiresAt: m.planExpiresAt },
    });
    console.log(`  ✓ ${m.brand} ${m.model} — ${m.listingType} — ${m.status}`);
  }
  return machines;
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedMaterials(farmerId: string) {
  console.log('\n🌾  Seeding materials...');

  const mats = [
    { farmerId, materialName: 'Wheat (Gehu)', photoUrl: 'https://picsum.photos/seed/wheat/300/300', expiresAt: future(20) },
    { farmerId, materialName: 'Soybean (Soyabin)', photoUrl: 'https://picsum.photos/seed/soybean/300/300', expiresAt: future(15) },
    { farmerId, materialName: 'Onion (Kanda)', photoUrl: 'https://picsum.photos/seed/onion/300/300', expiresAt: past(2) }, // expired
    { farmerId, materialName: 'Cow Dung Manure', photoUrl: 'https://picsum.photos/seed/compost/300/300', expiresAt: future(25) },
  ];

  for (const m of mats) {
    await prisma.farmerMaterial.create({ data: m }).catch(() => {});
  }
  console.log(`  ✓ 4 materials (1 expired for edge-case testing)`);
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedLabour() {
  console.log('\n👷  Seeding labour workers...');

  const l1 = await upsertUser({ id: IDS.labour1, phoneNumber: '+919100000011',
    name: 'Mohan Kamble', role: 'LABOUR', ...COORDS.labour1 });
  const l2 = await upsertUser({ id: IDS.labour2, phoneNumber: '+919100000012',
    name: 'Rajesh Yadav', role: 'LABOUR', ...COORDS.labour2 });

  await prisma.labourProfile.upsert({
    where:  { userId: l1.id },
    create: {
      id: IDS.labProf1, userId: l1.id,
      skills: ['Ploughing (Nangarni)', 'Harvesting (Katni/Kapni)', 'Weeding (Nindai/Khurpi)'],
      experience: '5 Years', pricePerDay: 600,
      isAvailable: true, rating: 4.3, jobsCompleted: 28,
      lat: COORDS.labour1.lat, lng: COORDS.labour1.lng,
    },
    update: { isAvailable: true, rating: 4.3 },
  });

  await prisma.labourProfile.upsert({
    where:  { userId: l2.id },
    create: {
      id: IDS.labProf2, userId: l2.id,
      skills: ['Spraying (Fawarani)', 'Cotton Picking', 'General Labour'],
      experience: '8 Years', pricePerDay: 750,
      isAvailable: true, rating: 4.8, jobsCompleted: 47,
      lat: COORDS.labour2.lat, lng: COORDS.labour2.lng,
    },
    update: { isAvailable: true, rating: 4.8 },
  });

  console.log(`  ✓ ${l1.name} (${l1.phoneNumber}) — 4.3★ — ₹600/day`);
  console.log(`  ✓ ${l2.name} (${l2.phoneNumber}) — 4.8★ — ₹750/day`);
  return { l1, l2 };
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedLabourBookings(farmerId1: string, farmerId2: string, labProf1Id: string, labProf2Id: string) {
  console.log('\n📋  Seeding labour bookings (all statuses)...');

  const bookings = [
    // Farmer1 → Labour1: Pending
    { farmerId: farmerId1, labourId: labProf1Id, taskType: 'Ploughing (Nangarni)', date: future(3), numberOfDays: 2, location: 'Survey No. 45, Pune', workers: 2, status: 'pending' },
    // Farmer1 → Labour1: Accepted
    { farmerId: farmerId1, labourId: labProf1Id, taskType: 'Harvesting (Katni/Kapni)', date: future(7), numberOfDays: 3, location: 'Survey No. 12, Pune', workers: 3, status: 'accepted' },
    // Farmer1 → Labour2: Rejected
    { farmerId: farmerId1, labourId: labProf2Id, taskType: 'Spraying (Fawarani)', date: past(5), numberOfDays: 1, location: 'Plot A, Pune', workers: 1, status: 'rejected' },
    // Farmer1 → Labour2: Completed
    { farmerId: farmerId1, labourId: labProf2Id, taskType: 'Cotton Picking', date: past(15), numberOfDays: 4, location: 'Field 3, Pune', workers: 5, status: 'completed' },
    // Farmer2 → Labour1: Pending
    { farmerId: farmerId2, labourId: labProf1Id, taskType: 'Weeding (Nindai/Khurpi)', date: future(2), numberOfDays: 1, location: 'Village Road, Mumbai', workers: 2, status: 'pending' },
    // Farmer2 → Labour2: Accepted
    { farmerId: farmerId2, labourId: labProf2Id, taskType: 'General Labour', date: future(5), numberOfDays: 2, location: 'Plot B, Mumbai', workers: 4, status: 'accepted' },
  ];

  for (const b of bookings) {
    await prisma.labourBooking.create({ data: b }).catch(() => {});
  }

  console.log('  ✓ pending × 2  |  accepted × 2  |  rejected × 1  |  completed × 1');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedTransporters() {
  console.log('\n🚛  Seeding transporters...');

  const t1 = await upsertUser({ id: IDS.trans1, phoneNumber: '+919100000021',
    name: 'Ajay Logistics', role: 'TRANSPORTER', ...COORDS.trans1 });
  const t2 = await upsertUser({ id: IDS.trans2, phoneNumber: '+919100000022',
    name: 'Vijay Transport', role: 'TRANSPORTER', ...COORDS.trans2 });

  const tp1 = await prisma.transporterProfile.upsert({
    where:  { userId: t1.id },
    create: {
      id: IDS.tprof1, userId: t1.id, businessName: 'Ajay Logistics Nashik',
      operatingRadius: 150, experience: '10 Years',
      lat: COORDS.trans1.lat, lng: COORDS.trans1.lng,
    },
    update: {},
  });

  const tp2 = await prisma.transporterProfile.upsert({
    where:  { userId: t2.id },
    create: {
      id: IDS.tprof2, userId: t2.id, businessName: 'Vijay Transport Nagpur',
      operatingRadius: 200, experience: '6 Years',
      lat: COORDS.trans2.lat, lng: COORDS.trans2.lng,
    },
    update: {},
  });

  console.log(`  ✓ ${t1.name} (${t1.phoneNumber})`);
  console.log(`  ✓ ${t2.name} (${t2.phoneNumber})`);
  return { t1, t2, tp1, tp2 };
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedVehicles(tp1Id: string, tp2Id: string, trans1UserId: string, trans2UserId: string) {
  console.log('\n🚌  Seeding vehicles (all subscription states)...');

  // Active subscription (Quarterly paid)
  const expiryActive = future(85);
  const v1Payment = await prisma.payment.create({
    data: {
      userId: trans1UserId, type: 'VEHICLE_SUBSCRIPTION', feature: 'VEHICLE_SUBSCRIPTION',
      amount: 1199, status: 'PAID', paymentMethod: 'UPI',
      entityId: IDS.vehicle1, entityType: 'VEHICLE',
      razorpayOrderId: `e2e_order_v1_${Date.now()}`,
      razorpayPaymentId: 'e2e_pay_v1_001',
    },
  });

  await prisma.vehicle.upsert({
    where: { id: IDS.vehicle1 },
    create: {
      id: IDS.vehicle1, transporterId: tp1Id,
      type: 'Tractor Trolley', model: 'Mahindra 575 + Trolley',
      numberPlate: 'MH15AB1234', capacity: '5 Tons',
      ratePerKm: 25, isAvailable: true,
      driverName: 'Santosh More', driverPhone: '+919876500001',
      plan: 'quarterly', expiryDate: expiryActive,
      rating: 4.5, tripCount: 34,
      locationLat: COORDS.trans1.lat, locationLng: COORDS.trans1.lng,
      images: ['https://picsum.photos/seed/tractortrolley/400/300'],
    },
    update: { plan: 'quarterly', expiryDate: expiryActive },
  });

  await prisma.subscription.create({
    data: {
      userId: trans1UserId, paymentId: v1Payment.id,
      subscriptionType: 'VEHICLE_PLAN', entityId: IDS.vehicle1, entityType: 'VEHICLE',
      vehicleId: IDS.vehicle1, plan: 'quarterly',
      startDate: past(5), endDate: expiryActive, renewalCount: 1,
    },
  }).catch(() => {});

  // Mini Truck (Monthly, expiring in 3 days)
  const expiryExpiringSoon = future(3);
  const v2Payment = await prisma.payment.create({
    data: {
      userId: trans1UserId, type: 'VEHICLE_SUBSCRIPTION', feature: 'VEHICLE_SUBSCRIPTION',
      amount: 499, status: 'PAID', paymentMethod: 'UPI',
      entityId: IDS.vehicle2, entityType: 'VEHICLE',
      razorpayOrderId: `e2e_order_v2_${Date.now()}`,
      razorpayPaymentId: 'e2e_pay_v2_001',
    },
  });

  await prisma.vehicle.upsert({
    where: { id: IDS.vehicle2 },
    create: {
      id: IDS.vehicle2, transporterId: tp1Id,
      type: 'Mini Truck', model: 'Tata Ace Gold',
      numberPlate: 'MH15CD5678', capacity: '1.5 Tons',
      ratePerKm: 18, isAvailable: true,
      driverName: 'Ramkrishna Patil', driverPhone: '+919876500002',
      plan: 'monthly', expiryDate: expiryExpiringSoon,
      rating: 4.1, tripCount: 12,
      locationLat: COORDS.trans1.lat + 0.01, locationLng: COORDS.trans1.lng,
      images: ['https://picsum.photos/seed/tataace/400/300'],
    },
    update: { plan: 'monthly', expiryDate: expiryExpiringSoon },
  });

  await prisma.subscription.create({
    data: {
      userId: trans1UserId, paymentId: v2Payment.id,
      subscriptionType: 'VEHICLE_PLAN', entityId: IDS.vehicle2, entityType: 'VEHICLE',
      vehicleId: IDS.vehicle2, plan: 'monthly',
      startDate: past(27), endDate: expiryExpiringSoon, renewalCount: 0,
    },
  }).catch(() => {});

  // Large Truck — EXPIRED subscription
  const expiryExpired = past(5);
  await prisma.vehicle.upsert({
    where: { id: IDS.vehicle3 },
    create: {
      id: IDS.vehicle3, transporterId: tp2Id,
      type: 'Large Truck', model: 'Eicher Pro 3015',
      numberPlate: 'MH40EF9012', capacity: '10 Tons',
      ratePerKm: 35, isAvailable: false,
      driverName: 'Nilesh Bhor', driverPhone: '+919876500003',
      plan: 'monthly', expiryDate: expiryExpired,  // EXPIRED
      rating: 3.8, tripCount: 7,
      locationLat: COORDS.trans2.lat, locationLng: COORDS.trans2.lng,
      images: ['https://picsum.photos/seed/largetruck/400/300'],
    },
    update: { plan: 'monthly', expiryDate: expiryExpired },
  });

  // Vehicle availability calendar entries
  await prisma.vehicleAvailability.upsert({
    where: { vehicleId_date: { vehicleId: IDS.vehicle1, date: future(5) } },
    create: { vehicleId: IDS.vehicle1, date: future(5), state: 'BUSY', note: 'Pre-booked trip' },
    update: {},
  });
  await prisma.vehicleAvailability.upsert({
    where: { vehicleId_date: { vehicleId: IDS.vehicle1, date: future(10) } },
    create: { vehicleId: IDS.vehicle1, date: future(10), state: 'MAINTENANCE', note: 'Service day' },
    update: {},
  });

  console.log('  ✓ Vehicle 1 (Tractor Trolley)  — quarterly active — 85 days left');
  console.log('  ✓ Vehicle 2 (Tata Ace Gold)    — monthly — expiring in 3 days ⚠️');
  console.log('  ✓ Vehicle 3 (Eicher Pro 3015)  — monthly EXPIRED ❌');
  console.log('  ✓ Calendar: Vehicle 1 busy on day+5, maintenance on day+10');
  return { v1: IDS.vehicle1, v2: IDS.vehicle2, v3: IDS.vehicle3 };
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedTransportRequests(farmerId1: string, farmerId2: string, trans1UserId: string) {
  console.log('\n🗺️   Seeding transport requests (all statuses)...');

  const requests = [
    // Farmer1 → Vehicle1: SENT (pending)
    {
      farmerId: farmerId1, vehicleId: IDS.vehicle1, transporterId: IDS.tprof1,
      pickup: 'Survey No. 45, Pune', drop: 'Nashik Market, Nashik',
      crop: 'Onion', quantity: '200 Qtl', requiredDate: future(8),
      status: 'SENT' as const,
    },
    // Farmer1 → Vehicle1: ACCEPTED
    {
      farmerId: farmerId1, vehicleId: IDS.vehicle1, transporterId: IDS.tprof1,
      pickup: 'Village Nighoje, Pune', drop: 'APMC Nashik',
      crop: 'Wheat', quantity: '150 Qtl', requiredDate: future(12),
      status: 'ACCEPTED' as const,
    },
    // Farmer1 → Vehicle2: SCHEDULED
    {
      farmerId: farmerId1, vehicleId: IDS.vehicle2, transporterId: IDS.tprof1,
      pickup: 'Hadapsar, Pune', drop: 'Mumbai Port',
      crop: 'Soybean', quantity: '80 Qtl', requiredDate: future(6),
      status: 'SCHEDULED' as const,
    },
    // Farmer2 → Vehicle1: AWAITING_APPROVAL (transporter marked done, waiting farmer)
    {
      farmerId: farmerId2, vehicleId: IDS.vehicle1, transporterId: IDS.tprof1,
      pickup: 'Borivali, Mumbai', drop: 'Nashik APMC',
      crop: 'Grapes', quantity: '50 Qtl', requiredDate: past(2),
      status: 'AWAITING_APPROVAL' as const,
    },
    // Farmer1 → Vehicle2: COMPLETED
    {
      farmerId: farmerId1, vehicleId: IDS.vehicle2, transporterId: IDS.tprof1,
      pickup: 'Pimpri, Pune', drop: 'Kolhapur Market',
      crop: 'Sugarcane', quantity: '300 Qtl', requiredDate: past(10),
      status: 'COMPLETED' as const,
    },
    // Farmer2 → Vehicle1: REJECTED
    {
      farmerId: farmerId2, vehicleId: IDS.vehicle1, transporterId: IDS.tprof1,
      pickup: 'Thane, Mumbai', drop: 'Aurangabad',
      crop: 'Cotton', quantity: '120 Qtl', requiredDate: past(7),
      status: 'REJECTED' as const,
    },
    // Farmer1 → Vehicle1: CANCELLED
    {
      farmerId: farmerId1, vehicleId: IDS.vehicle1, transporterId: IDS.tprof1,
      pickup: 'Pune Station', drop: 'Solapur',
      crop: 'Pomegranate', quantity: '40 Qtl', requiredDate: past(3),
      status: 'CANCELLED' as const, cancellationReason: 'Crop not ready',
    },
    // Farmer2 → Vehicle3: SENT (to expired vehicle — edge case)
    {
      farmerId: farmerId2, vehicleId: IDS.vehicle3, transporterId: IDS.tprof2,
      pickup: 'Nagpur City', drop: 'Amravati Market',
      crop: 'Orange', quantity: '200 Qtl', requiredDate: future(4),
      status: 'SENT' as const,
    },
  ];

  for (const r of requests) {
    await prisma.transportRequest.create({ data: r }).catch(() => {});
  }

  console.log('  ✓ SENT × 2  |  ACCEPTED × 1  |  SCHEDULED × 1');
  console.log('  ✓ AWAITING_APPROVAL × 1  |  COMPLETED × 1  |  REJECTED × 1  |  CANCELLED × 1');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedRentalRequests(farmerId1: string, farmerId2: string) {
  console.log('\n🔧  Seeding machine rental requests (all statuses)...');

  const reqs = [
    // Farmer2 rents Farmer1's machine (machine2 — RENT listing)
    { machineId: IDS.machine2, borrowerId: farmerId2, ownerId: farmerId1, startDate: future(5), numberOfDays: 3, pricePerDay: 1500, totalPrice: 4500, status: 'PENDING' as const },
    { machineId: IDS.machine2, borrowerId: farmerId2, ownerId: farmerId1, startDate: future(14), numberOfDays: 2, pricePerDay: 1500, totalPrice: 3000, status: 'ACCEPTED' as const },
    { machineId: IDS.machine3, borrowerId: farmerId2, ownerId: farmerId1, startDate: past(20), numberOfDays: 1, pricePerDay: 800, totalPrice: 800, status: 'COMPLETED' as const },
    { machineId: IDS.machine3, borrowerId: farmerId2, ownerId: farmerId1, startDate: past(5), numberOfDays: 2, pricePerDay: 800, totalPrice: 1600, status: 'REJECTED' as const, rejectReason: 'Already booked for that period' },
    { machineId: IDS.machine2, borrowerId: farmerId2, ownerId: farmerId1, startDate: past(2), numberOfDays: 1, pricePerDay: 1500, totalPrice: 1500, status: 'CANCELLED' as const },
  ];

  for (const r of reqs) {
    await prisma.rentalRequest.create({ data: r }).catch(() => {});
  }
  console.log('  ✓ PENDING × 1  |  ACCEPTED × 1  |  COMPLETED × 1  |  REJECTED × 1  |  CANCELLED × 1');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedPayments(farmer1Id: string, farmer2Id: string, trans1Id: string) {
  console.log('\n💳  Seeding payment records...');

  const payments = [
    // Machine listing payment — PAID (Farmer1 for machine1 pro plan)
    {
      userId: farmer1Id, type: 'MACHINE_LISTING_PRO', feature: 'MACHINE_LISTING_PRO',
      amount: 499, status: 'PAID', paymentMethod: 'UPI',
      entityId: IDS.machine1, entityType: 'MACHINE',
      razorpayOrderId: `e2e_ml1_${Date.now()}`, razorpayPaymentId: 'e2e_pay_ml1',
    },
    // Contact unlock — PAID (Farmer2 unlocks Labour1 contact)
    {
      userId: farmer2Id, type: 'CONTACT_UNLOCK', feature: 'CONTACT_UNLOCK',
      amount: 29, status: 'PAID', paymentMethod: 'UPI',
      entityId: IDS.labProf1, entityType: 'CONTACT',
      razorpayOrderId: `e2e_cu1_${Date.now()}`, razorpayPaymentId: 'e2e_pay_cu1',
    },
    // Vehicle subscription — PENDING (Transporter1 creating order but not paid yet)
    {
      userId: trans1Id, type: 'VEHICLE_SUBSCRIPTION', feature: 'VEHICLE_SUBSCRIPTION',
      amount: 3999, status: 'PENDING', paymentMethod: 'UPI',
      entityId: IDS.vehicle2, entityType: 'VEHICLE',
      razorpayOrderId: `e2e_vs_pending_${Date.now()}`,
    },
    // Payment — FAILED (Farmer2 failed machine listing payment)
    {
      userId: farmer2Id, type: 'MACHINE_LISTING_BASIC', feature: 'MACHINE_LISTING_BASIC',
      amount: 299, status: 'FAILED', paymentMethod: 'UPI',
      entityId: IDS.machine3, entityType: 'MACHINE',
      razorpayOrderId: `e2e_fail_${Date.now()}`,
    },
  ];

  for (const p of payments) {
    await prisma.payment.create({ data: p }).catch(() => {});
  }
  console.log('  ✓ PAID × 3  |  PENDING × 1  |  FAILED × 1');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedNotifications(farmer1Id: string, labour1Id: string, trans1Id: string) {
  console.log('\n🔔  Seeding notifications...');

  const notifs = [
    // Farmer notifications
    { userId: farmer1Id, title: '✅ New Labour Booking', message: 'Mohan Kamble accepted your ploughing request for 3 days.', type: 'SUCCESS' as const, link: '/(farmer)/labour/my-requests', isRead: false },
    { userId: farmer1Id, title: '🚛 Transport Request Sent', message: 'Your wheat transport request has been sent to Ajay Logistics.', type: 'INFO' as const, link: '/(farmer)/transport/my-requests', isRead: false },
    { userId: farmer1Id, title: '❌ Request Rejected', message: 'Your spraying request was rejected. Please find another worker.', type: 'ERROR' as const, link: '/(farmer)/labour/my-requests', isRead: true },
    { userId: farmer1Id, title: '💰 Payment Successful', message: 'Your machine listing plan was activated. Your Mahindra 575 is now live!', type: 'SUCCESS' as const, link: '/(farmer)/(tabs)', isRead: true },
    { userId: farmer1Id, title: '⚠️ Subscription Expiring', message: 'Your Tata Ace vehicle subscription expires in 3 days. Renew now!', type: 'WARNING' as const, link: '/(transporter)/subscriptions', isRead: false },

    // Labour notifications
    { userId: labour1Id, title: '🌱 नया ऑर्डर आया!', message: 'Ramesh Patel ने जुताई का काम मांगा — 2 दिन। जल्दी जवाब दें।', type: 'INFO' as const, link: '/(labour)/incoming-jobs', isRead: false },
    { userId: labour1Id, title: '✅ काम मिल गया!', message: 'Suresh Sharma ने आपकी बुकिंग स्वीकार की। कल सुबह 7 बजे तैयार रहें।', type: 'SUCCESS' as const, link: '/(labour)/active-jobs', isRead: false },
    { userId: labour1Id, title: '🎉 काम पूरा हुआ!', message: 'कपास तुड़ाई का काम पूरा हुआ। ₹2400 की कमाई!', type: 'SUCCESS' as const, link: '/(labour)/earnings', isRead: true },

    // Transporter notifications
    { userId: trans1Id, title: '📦 नया ट्रांसपोर्ट रिक्वेस्ट', message: 'Ramesh Patel ने प्याज की ढुलाई के लिए रिक्वेस्ट भेजी — 200 क्विंटल।', type: 'INFO' as const, link: '/(transporter)', isRead: false },
    { userId: trans1Id, title: '✅ Subscription Activated!', message: 'Your Tractor Trolley quarterly subscription is now active. Happy earning!', type: 'SUCCESS' as const, link: '/(transporter)/subscriptions', isRead: true },
    { userId: trans1Id, title: '⚠️ Subscription Expiring Soon', message: 'Your Tata Ace monthly subscription expires in 3 days. Renew now to keep earning!', type: 'WARNING' as const, link: '/(transporter)/subscriptions', isRead: false },
  ];

  for (const n of notifs) {
    await prisma.notification.create({ data: n }).catch(() => {});
  }
  console.log('  ✓ Farmer: 5 notifs  |  Labour: 3 notifs  |  Transporter: 3 notifs');
  console.log('  ✓ Mix of read/unread, all types (INFO/SUCCESS/WARNING/ERROR)');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedCallLogs(farmer1Id: string, labour1Id: string, trans1Id: string) {
  console.log('\n📞  Seeding call logs...');

  const calls = [
    { callerId: farmer1Id, receiverId: labour1Id, bookingType: 'LABOUR', status: 'initiated' },
    { callerId: farmer1Id, receiverId: trans1Id, bookingType: 'TRANSPORT', status: 'initiated' },
    { callerId: labour1Id, receiverId: farmer1Id, bookingType: 'LABOUR', status: 'initiated' },
  ];

  for (const c of calls) {
    await prisma.callLog.create({
      data: { ...c, exotelCallId: `EXOTEL_E2E_${Date.now()}`, durationSeconds: Math.floor(Math.random() * 180) + 30 },
    }).catch(() => {});
  }
  console.log('  ✓ 3 call logs (Farmer↔Labour, Farmer↔Transporter)');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedFeeConfig() {
  console.log('\n⚙️   Seeding fee config...');

  const fees = [
    { feature: 'CONTACT_UNLOCK',          amountPaise: 2900,  label: 'Contact Unlock',          isActive: true },
    { feature: 'CALL_FEE',                amountPaise: 1900,  label: 'Call Fee',                isActive: true },
    { feature: 'MACHINE_LISTING_BASIC',   amountPaise: 29900, label: 'Machine Basic Plan',       isActive: true },
    { feature: 'MACHINE_LISTING_PRO',     amountPaise: 49900, label: 'Machine Pro Plan',         isActive: true },
    { feature: 'MACHINE_LISTING_FREE',    amountPaise: 0,     label: 'Machine Free Plan',        isActive: true },
    { feature: 'VEHICLE_SUBSCRIPTION',    amountPaise: 49900, label: 'Vehicle Monthly',          isActive: true },
  ];

  for (const f of fees) {
    await prisma.feeConfig.upsert({
      where: { feature: f.feature },
      create: f,
      update: { amountPaise: f.amountPaise, isActive: f.isActive },
    });
  }
  console.log('  ✓ 6 fee configs (CONTACT_UNLOCK, CALL_FEE, MACHINE plans, VEHICLE_SUBSCRIPTION)');
}

// ─────────────────────────────────────────────────────────────────────────────
async function seedMachineCategories() {
  const cats = ['Tractor', 'Harvester', 'Rotavator', 'Sprayer', 'Seed Drill', 'Baler', 'Cultivator', 'Plough', 'Thresher', 'Water Pump'];
  for (const name of cats) {
    await prisma.machineCategory.upsert({
      where: { name }, create: { name, icon: '🚜', isActive: true }, update: {},
    });
  }
  console.log(`  ✓ ${cats.length} machine categories`);
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   KrushiMitra — E2E Test Data Seed');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n📱  Login with OTP: 123456 (dev bypass)\n');

  try {
    await seedMachineCategories();
    await seedFeeConfig();

    const { f1, f2 } = await seedFarmers();
    await seedMachines(f1.id);
    await seedMaterials(f1.id);

    const { l1, l2 } = await seedLabour();
    await seedLabourBookings(f1.id, f2.id, IDS.labProf1, IDS.labProf2);

    const { t1, t2, tp1, tp2 } = await seedTransporters();
    await seedVehicles(tp1.id, tp2.id, t1.id, t2.id);
    await seedTransportRequests(f1.id, f2.id, t1.id);

    await seedRentalRequests(f1.id, f2.id);
    await seedPayments(f1.id, f2.id, t1.id);
    await seedCallLogs(f1.id, l1.id, t1.id);
    await seedNotifications(f1.id, l1.id, t1.id);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   ✅  Seed complete!\n');
    console.log('   TEST ACCOUNTS (OTP: 123456)');
    console.log('   ─────────────────────────────────────────────────');
    console.log('   FARMER  │ +919100000001 │ Ramesh Patel     │ Full data');
    console.log('   FARMER  │ +919100000002 │ Suresh Sharma    │ Buyer/booker');
    console.log('   LABOUR  │ +919100000011 │ Mohan Kamble     │ All job statuses');
    console.log('   LABOUR  │ +919100000012 │ Rajesh Yadav     │ High-rating worker');
    console.log('   TRANS   │ +919100000021 │ Ajay Logistics   │ Active subscription');
    console.log('   TRANS   │ +919100000022 │ Vijay Transport  │ Expired subscription');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
