-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'GUEST';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationAddress" TEXT,
ALTER COLUMN "role" SET DEFAULT 'GUEST';

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

-- CreateIndex
CREATE UNIQUE INDEX "LabourProfile_userId_key" ON "LabourProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TransporterProfile_userId_key" ON "TransporterProfile"("userId");

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
