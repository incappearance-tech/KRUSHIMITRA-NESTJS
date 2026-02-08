-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FARMER', 'LABOUR', 'TRANSPORTER', 'GUEST');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('SELL', 'RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('AVAILABLE', 'SOLD', 'IN_RENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'GUEST',
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationAddress" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "fcmToken" TEXT,
    "deviceOS" TEXT,
    "privacyConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentTimestamp" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabourProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skills" TEXT[],
    "experience" TEXT,
    "pricePerDay" DECIMAL(10,2) NOT NULL,
    "workPreference" TEXT NOT NULL DEFAULT 'Day',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jobsCompleted" INTEGER NOT NULL DEFAULT 0,
    "callsReceived" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabourProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransporterProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "operatingRadius" INTEGER NOT NULL DEFAULT 50,
    "experience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransporterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTrip" (
    "id" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "farmerId" TEXT,
    "farmerName" TEXT NOT NULL,
    "farmerPhone" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "dropLocation" TEXT NOT NULL,
    "loadType" TEXT,
    "vehicleType" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "transporterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "numberPlate" TEXT,
    "capacity" TEXT,
    "ratePerKm" DECIMAL(10,2),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "images" TEXT[],
    "driverName" TEXT,
    "driverPhone" TEXT,
    "driverLicense" TEXT,
    "plan" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "yearOfPurchase" INTEGER NOT NULL,
    "listingType" "ListingType" NOT NULL DEFAULT 'SELL',
    "price" DECIMAL(10,2) NOT NULL,
    "rentUnit" TEXT,
    "images" TEXT[],
    "status" "ListingStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "machineId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "gatewayTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isVerified_idx" ON "User"("isVerified");

-- CreateIndex
CREATE INDEX "User_role_isVerified_idx" ON "User"("role", "isVerified");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_phoneNumber_role_idx" ON "User"("phoneNumber", "role");

-- CreateIndex
CREATE UNIQUE INDEX "LabourProfile_userId_key" ON "LabourProfile"("userId");

-- CreateIndex
CREATE INDEX "LabourProfile_isAvailable_idx" ON "LabourProfile"("isAvailable");

-- CreateIndex
CREATE INDEX "LabourProfile_rating_idx" ON "LabourProfile"("rating");

-- CreateIndex
CREATE INDEX "LabourProfile_isAvailable_rating_idx" ON "LabourProfile"("isAvailable", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "TransporterProfile_userId_key" ON "TransporterProfile"("userId");

-- CreateIndex
CREATE INDEX "TransportTrip_transporterId_idx" ON "TransportTrip"("transporterId");

-- CreateIndex
CREATE INDEX "TransportTrip_farmerId_idx" ON "TransportTrip"("farmerId");

-- CreateIndex
CREATE INDEX "TransportTrip_status_idx" ON "TransportTrip"("status");

-- CreateIndex
CREATE INDEX "TransportTrip_date_idx" ON "TransportTrip"("date");

-- CreateIndex
CREATE INDEX "TransportTrip_transporterId_status_idx" ON "TransportTrip"("transporterId", "status");

-- CreateIndex
CREATE INDEX "TransportTrip_farmerId_status_idx" ON "TransportTrip"("farmerId", "status");

-- CreateIndex
CREATE INDEX "Machine_status_idx" ON "Machine"("status");

-- CreateIndex
CREATE INDEX "Machine_listingType_idx" ON "Machine"("listingType");

-- CreateIndex
CREATE INDEX "Machine_category_idx" ON "Machine"("category");

-- CreateIndex
CREATE INDEX "Machine_status_listingType_idx" ON "Machine"("status", "listingType");

-- CreateIndex
CREATE INDEX "Machine_category_status_idx" ON "Machine"("category", "status");

-- CreateIndex
CREATE INDEX "Machine_price_idx" ON "Machine"("price");

-- CreateIndex
CREATE INDEX "Machine_createdAt_idx" ON "Machine"("createdAt");

-- CreateIndex
CREATE INDEX "Machine_ownerId_idx" ON "Machine"("ownerId");

-- AddForeignKey
ALTER TABLE "LabourProfile" ADD CONSTRAINT "LabourProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransporterProfile" ADD CONSTRAINT "TransporterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "TransporterProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "TransporterProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
