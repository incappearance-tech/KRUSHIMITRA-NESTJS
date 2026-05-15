/**
 * Clears all application data from the database.
 * Preserves: _prisma_migrations, MachineCategory, FeeConfig (config/lookup tables).
 * Deletes:   all user-generated data in correct FK order.
 *
 * Usage:  npx ts-node prisma/clear-db.ts
 * npm:    npm run db:clear
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDb() {
  console.log('🗑️  Clearing database...\n');

  // Single TRUNCATE with CASCADE — PostgreSQL handles FK order automatically.
  // Excludes _prisma_migrations (Prisma internal) and lookup tables.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "WebhookLog",
      "AuditLog",
      "CallLog",
      "Notification",
      "Subscription",
      "Payment",
      "FarmerMaterial",
      "VehicleAvailability",
      "Driver",
      "TransportRequest",
      "TransportTrip",
      "RentalRequest",
      "Order",
      "Machine",
      "Vehicle",
      "LabourBooking",
      "LabourProfile",
      "TransporterProfile",
      "User"
    CASCADE
  `);

  console.log('✅  All user data cleared.\n');

  // Show remaining row counts so we know what's still there
  const [
    feeCount,
    catCount,
  ] = await Promise.all([
    prisma.feeConfig.count(),
    prisma.machineCategory.count(),
  ]);

  console.log('📊  Preserved lookup tables:');
  console.log(`   FeeConfig:       ${feeCount} rows`);
  console.log(`   MachineCategory: ${catCount} rows`);
  console.log('\nDone.');
}

clearDb()
  .catch((e) => {
    console.error('❌  Clear failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
