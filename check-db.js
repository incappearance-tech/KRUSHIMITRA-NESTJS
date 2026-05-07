const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const { PrismaClient } = require('@prisma/client');

async function run() {
  const prisma = new PrismaClient();
  try {
    const machines = await prisma.machine.findMany({
      include: { owner: { select: { name: true, locationLat: true, locationLng: true } } }
    });
    console.log(JSON.stringify(machines, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
