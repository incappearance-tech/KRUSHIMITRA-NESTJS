import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateTransporterProfileDto } from './dto/transporter-profile.dto';

@Injectable()
export class TransporterProfileService {
    constructor(private prisma: PrismaService) { }

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

        const leadsReceived = await this.prisma.transportRequest.count({
            where: { transporterId: profile.id },
        });
        const tripsCompleted = await this.prisma.transportRequest.count({
            where: { transporterId: profile.id, status: 'COMPLETED' },
        });

        return {
            ...profile,
            leadsReceived,
            tripsCompleted,
            vehicles: profile.vehicles.map(v => ({
                ...v,
                ratePerKm: v.ratePerKm ? Number(v.ratePerKm) : null
            }))
        };
    }

    async getTransporterById(id: string, userId?: string) {
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { id },
            include: { user: true, vehicles: true },
        });
        if (!profile) throw new NotFoundException('Transporter not found');

        const tripsCompleted = await this.prisma.transportRequest.count({
            where: { transporterId: profile.id, status: 'COMPLETED' },
        });

        // Fetch upcoming blocked dates (calendar)
        const nowStart = new Date();
        nowStart.setHours(0,0,0,0);
        const vehicleIds = profile.vehicles.map(v => v.id);
        const blockedEntries = vehicleIds.length > 0
          ? await this.prisma.vehicleAvailability.findMany({
              where: { vehicleId: { in: vehicleIds }, date: { gte: nowStart }, state: { not: 'AVAILABLE' } },
              select: { vehicleId: true, date: true, state: true }
            })
          : [];
          
        const blockedDatesByVehicle = new Map<string, { date: string, state: string }[]>();
        for (const b of blockedEntries) {
          if (!blockedDatesByVehicle.has(b.vehicleId)) blockedDatesByVehicle.set(b.vehicleId, []);
          blockedDatesByVehicle.get(b.vehicleId)!.push({
            date: b.date.toISOString().split('T')[0],
            state: b.state
          });
        }

        // Fetch user's active requests if userId provided
        const activeRequests = userId && vehicleIds.length > 0
            ? await this.prisma.transportRequest.findMany({
                where: { 
                  farmerId: userId, 
                  vehicleId: { in: vehicleIds },
                  status: { in: ['ACCEPTED', 'SCHEDULED', 'AWAITING_APPROVAL'] }
                },
                select: { vehicleId: true, requiredDate: true }
              })
            : [];
            
        const activeDatesByVehicle = new Map<string, string[]>();
        for (const r of activeRequests) {
          if (!activeDatesByVehicle.has(r.vehicleId)) activeDatesByVehicle.set(r.vehicleId, []);
          activeDatesByVehicle.get(r.vehicleId)!.push(r.requiredDate.toISOString().split('T')[0]);
        }

        return { 
            ...profile, 
            tripsCompleted,
            vehicles: profile.vehicles.map(v => ({
                ...v,
                blockedDates: blockedDatesByVehicle.get(v.id) || [],
                activeDates: activeDatesByVehicle.get(v.id) || []
            }))
        };
    }

    async upsertProfile(userId: string, dto: CreateTransporterProfileDto) {
        const { locationLat, locationLng, ...profileData } = dto;

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                locationLat: locationLat !== undefined ? locationLat : undefined,
                locationLng: locationLng !== undefined ? locationLng : undefined,
                name: profileData.businessName || undefined,
                role: 'TRANSPORTER',
            },
        });

        return this.prisma.transporterProfile.upsert({
            where: { userId },
            create: { ...profileData, userId },
            update: { ...profileData },
            include: { user: true, vehicles: true },
        });
    }
}
