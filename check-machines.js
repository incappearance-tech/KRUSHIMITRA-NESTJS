const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.machine.findMany().then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error).finally(() => prisma.$disconnect());
