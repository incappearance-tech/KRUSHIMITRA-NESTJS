const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

async function main() {
    const u = await prisma.user.findFirst();
    const token = jwt.sign({ id: u.id, role: u.role }, 'supersafesecretkeyfor100kusers');

    console.log('Testing Transporter API...');
    const res1 = await fetch('http://localhost:3000/api/v1/transporter/vehicles/browse?vehicleTypes=Tractor&searchQuery=tat');
    console.log(res1.status, await res1.text());

    console.log('Testing Labour API...');
    const res2 = await fetch('http://localhost:3000/api/v1/labour/all?skills=Harvesting');
    console.log(res2.status, await res2.text());
}

main().finally(() => prisma.$disconnect());
