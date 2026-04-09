"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function listUsers() {
    console.log(`\n🔍 LISTING RECENT USERS`);
    const users = await prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
            phoneNumber: true,
            role: true,
            name: true
        }
    });
    console.log(JSON.stringify(users, null, 2));
}
listUsers()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=list-users.js.map