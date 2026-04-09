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

    async getTransporterById(id: string) {
        const profile = await this.prisma.transporterProfile.findUnique({
            where: { id },
            include: { user: true, vehicles: true },
        });
        if (!profile) throw new NotFoundException('Transporter not found');

        const tripsCompleted = await this.prisma.transportRequest.count({
            where: { transporterId: profile.id, status: 'COMPLETED' },
        });
        return { ...profile, tripsCompleted };
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
