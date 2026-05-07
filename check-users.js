const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({ where: { id: { in: ['55d14101-3833-4f3e-8023-f648418d1f55', 'caaff0a8-ef6d-4fc2-8bc7-cd3b87cae5d3'] } } }).then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error).finally(() => prisma.$disconnect());
