"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function debugUser(phone) {
    console.log(`\n🔍 DEEP DEBUG: User ${phone}`);
    const user = await prisma.user.findUnique({
        where: { phoneNumber: phone },
        include: {
            labourProfile: true,
            transporterProfile: true,
        }
    });
    if (!user) {
        console.log('❌ User NOT found in database');
        return;
    }
    console.log('--- USER TABLE ---');
    console.log(JSON.stringify({
        id: user.id,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
        locationAddress: user.locationAddress,
        state: user.state,
        district: user.district,
        taluka: user.taluka,
        village: user.village,
        pincode: user.pincode,
        locationLat: user.locationLat,
        locationLng: user.locationLng,
    }, null, 2));
    if (user.role === 'TRANSPORTER') {
        console.log('\n--- TRANSPORTER PROFILE ---');
        console.log(JSON.stringify(user.transporterProfile, null, 2));
    }
    if (user.role === 'LABOUR') {
        console.log('\n--- LABOUR PROFILE ---');
        console.log(JSON.stringify(user.labourProfile, null, 2));
    }
    const hasLegacyLocation = !!user.locationAddress;
    const hasStructuredLocation = !!user.state && !!user.district && (!!user.taluka || !!user.village);
    const hasAnyLocation = hasLegacyLocation || hasStructuredLocation || (!!user.locationLat && !!user.locationLng);
    let hasName = !!user.name;
    let profileFound = false;
    if (user.role === 'TRANSPORTER') {
        profileFound = !!user.transporterProfile;
        if (user.transporterProfile && !hasName && user.transporterProfile.businessName)
            hasName = true;
    }
    else if (user.role === 'LABOUR') {
        profileFound = !!user.labourProfile;
    }
    else if (user.role === 'FARMER') {
        profileFound = true;
    }
    console.log('\n--- SIMULATED COMPLETENESS CHECK ---');
    console.log(`1. Profile record found: ${profileFound}`);
    console.log(`2. Name present (incl. fallback): ${hasName} (user.name="${user.name}")`);
    console.log(`3. Location found: ${hasAnyLocation}`);
    console.log(`   - Legacy: ${hasLegacyLocation} ("${user.locationAddress}")`);
    console.log(`   - Structured: ${hasStructuredLocation} ("${user.state}", "${user.district}")`);
    console.log(`   - Lat/Lng: ${!!user.locationLat && !!user.locationLng} (${user.locationLat}, ${user.locationLng})`);
    const isComplete = profileFound && hasName && hasAnyLocation;
    console.log(`\n✅ RESULT: Profile is ${isComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
}
const phone = '+919527398933';
debugUser(phone)
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=debug-user.js.map