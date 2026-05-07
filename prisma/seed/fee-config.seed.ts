import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding FeeConfig table...');

  const fees = [
    {
      feature: 'MACHINE_LISTING_BASIC',
      amountPaise: 9900, // 99 INR
      label: 'Basic Machine Listing (30 Days)',
    },
    {
      feature: 'MACHINE_LISTING_PRO',
      amountPaise: 24900, // 249 INR
      label: 'Pro Machine Listing (30 Days)',
    },
    {
      feature: 'MACHINE_LISTING',
      amountPaise: 0, // Free
      label: 'Free Machine Listing',
    },
    {
      feature: 'VEHICLE_SUBSCRIPTION_MONTHLY',
      amountPaise: 49900, // 499 INR
      label: 'Monthly Vehicle Subscription',
    },
    {
      feature: 'VEHICLE_SUBSCRIPTION_QUARTERLY',
      amountPaise: 119900, // 1199 INR
      label: 'Quarterly Vehicle Subscription',
    },
    {
      feature: 'VEHICLE_SUBSCRIPTION_YEARLY',
      amountPaise: 399900, // 3999 INR
      label: 'Yearly Vehicle Subscription',
    },
    {
      feature: 'CONTACT_UNLOCK',
      amountPaise: 2900, // 29 INR
      label: 'Contact Details Unlock Fee',
    },
    {
      feature: 'LABOUR_BOOKING',
      amountPaise: 0, // Currently free, can be updated later
      label: 'Labour Booking Fee',
    },
  ];

  for (const fee of fees) {
    await prisma.feeConfig.upsert({
      where: { feature: fee.feature },
      update: { amountPaise: fee.amountPaise, label: fee.label },
      create: {
        feature: fee.feature,
        amountPaise: fee.amountPaise,
        label: fee.label,
        isActive: true,
      },
    });
  }

  console.log('FeeConfig seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
