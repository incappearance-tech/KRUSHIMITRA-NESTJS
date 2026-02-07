import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateTransporterProfileDto } from './dto/transporter-profile.dto';
import { CreateVehicleDto } from './dto/vehicle.dto';
import { CreateTripDto } from './dto/create-trip.dto';

@Injectable()
export class TransporterService {
    constructor(private prisma: PrismaService) { }

    async getLeads(userId: string) {
        console.log(`[getLeads] Fetching leads for userId: ${userId}`);
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { userId }
        });

        if (!profile) {
            console.log(`[getLeads] No transporter profile found for userId: ${userId}`);
            return [];
        }

        console.log(`[getLeads] Found profile with id: ${profile.id}`);
        const leads = await this.prisma.transportTrip.findMany({
            where: { transporterId: profile.id },
            orderBy: { date: 'desc' }
        });

        console.log(`[getLeads] Found ${leads.length} leads for transporter ${profile.id}`);
        if (leads.length === 0) {
            return [];
        }

        return leads;
    }

    async updateLeadStatus(userId: string, tripId: string, status: string) {
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { userId }
        });

        if (!profile) {
            console.error(`[updateLeadStatus] Transporter profile not found for userId: ${userId}`);
            throw new NotFoundException('Transporter profile not found');
        }

        const trip = await this.prisma.transportTrip.findUnique({
            where: { id: tripId }
        });

        if (!trip) {
            console.error(`[updateLeadStatus] Trip not found with id: ${tripId}`);
            throw new NotFoundException('This trip no longer exists. Please refresh your leads list.');
        }

        if (trip.transporterId !== profile.id) {
            console.error(`[updateLeadStatus] Unauthorized: Trip ${tripId} does not belong to transporter ${profile.id}`);
            throw new NotFoundException('You are not authorized to update this trip.');
        }

        console.log(`[updateLeadStatus] Updating trip ${tripId} status to ${status}`);
        return this.prisma.transportTrip.update({
            where: { id: tripId },
            data: { status }
        });
    }

    async getProfile(userId: string) {
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { userId },
            include: { user: true, vehicles: true },
        });

        if (!profile) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw new NotFoundException('User not found');
            return { user, profile: null };
        }

        const leadsReceived = await this.prisma.transportTrip.count({
            where: { transporterId: profile.id }
        });

        const tripsCompleted = await this.prisma.transportTrip.count({
            where: { transporterId: profile.id, status: 'completed' }
        });

        return { ...profile, leadsReceived, tripsCompleted };
    }

    async getTransporterById(id: string) {
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { id },
            include: { user: true, vehicles: true },
        });

        if (!profile) {
            throw new NotFoundException('Transporter not found');
        }

        const tripsCompleted = await this.prisma.transportTrip.count({
            where: { transporterId: profile.id, status: 'completed' }
        });

        return { ...profile, tripsCompleted };
    }

    async upsertProfile(userId: string, dto: CreateTransporterProfileDto) {
        const { locationAddress, ...profileData } = dto;

        // Update user location and role
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                locationAddress: locationAddress || undefined,
                role: 'TRANSPORTER' // Upgrade from GUEST to TRANSPORTER
            },
        });

        return this.prisma.transporterProfile.upsert({
            where: { userId },
            create: {
                ...profileData,
                userId,
            },
            update: {
                ...profileData,
            },
            include: { user: true, vehicles: true }
        });
    }

    async addVehicle(userId: string, dto: CreateVehicleDto) {
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { userId }
        });

        if (!profile) {
            throw new NotFoundException('Transporter profile not found');
        }

        const { expiryDate, ...vehicleData } = dto;

        return this.prisma.vehicle.create({
            data: {
                ...vehicleData,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                transporterId: profile.id
            }
        });
    }

    async deleteVehicle(vehicleId: string) {
        return this.prisma.vehicle.delete({
            where: { id: vehicleId }
        });
    }

    async updateVehicle(userId: string, vehicleId: string, dto: Partial<CreateVehicleDto>) {
        const { expiryDate, ...vehicleData } = dto;

        return this.prisma.vehicle.update({
            where: { id: vehicleId },
            data: {
                ...vehicleData,
                expiryDate: expiryDate ? new Date(expiryDate) : undefined,
            }
        })
    }

    async findAll() {
        return this.prisma.transporterProfile.findMany({
            include: { user: true, vehicles: true }
        });
    }

    async bookTrip(farmerId: string, dto: CreateTripDto) {
        console.log(`[bookTrip] Booking trip for farmer ${farmerId} with transporter ${dto.transporterId}`);

        const farmer = await this.prisma.user.findUnique({
            where: { id: farmerId }
        });

        if (!farmer) {
            console.error(`[bookTrip] Farmer not found with id: ${farmerId}`);
            throw new NotFoundException('Farmer not found');
        }

        const transporter = await this.prisma.transporterProfile.findUnique({
            where: { id: dto.transporterId }
        });

        if (!transporter) {
            console.error(`[bookTrip] Transporter profile not found with id: ${dto.transporterId}`);
            throw new NotFoundException('Transporter not found');
        }

        // Check for recent rejected requests (within last 24 hours)
        const oneDayAgo = new Date();
        oneDayAgo.setHours(oneDayAgo.getHours() - 24);

        const recentRejectedRequest = await this.prisma.transportTrip.findFirst({
            where: {
                farmerId: farmerId,
                transporterId: dto.transporterId,
                status: 'rejected',
                updatedAt: {
                    gte: oneDayAgo
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        if (recentRejectedRequest) {
            const hoursRemaining = Math.ceil(
                (24 - (Date.now() - recentRejectedRequest.updatedAt.getTime()) / (1000 * 60 * 60))
            );
            console.log(`[bookTrip] Blocked: Recent rejection found. ${hoursRemaining} hours remaining.`);
            throw new BadRequestException(
                `This transporter declined your previous request. Please wait ${hoursRemaining} more hour(s) before requesting again.`
            );
        }

        console.log(`[bookTrip] Creating trip for transporter ${transporter.id} (userId: ${transporter.userId})`);
        const trip = await this.prisma.transportTrip.create({
            data: {
                transporterId: dto.transporterId,
                farmerId: farmerId,
                farmerName: farmer.name || 'Unknown Farmer',
                farmerPhone: farmer.phoneNumber,
                pickupLocation: dto.pickupLocation,
                dropLocation: dto.dropLocation,
                loadType: dto.loadType,
                vehicleType: dto.vehicleType,
                date: new Date(dto.date),
                status: 'pending'
            }
        });

        console.log(`[bookTrip] Trip created successfully with id: ${trip.id}`);
        return trip;
    }

    async getFarmerTrips(farmerId: string) {
        return this.prisma.transportTrip.findMany({
            where: { farmerId },
            include: {
                transporter: {
                    include: { user: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }
}
