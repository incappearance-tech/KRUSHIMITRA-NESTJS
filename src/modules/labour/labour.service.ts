import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateLabourProfileDto, UpdateLabourProfileDto } from './dto/labour-profile.dto';

@Injectable()
export class LabourService {
    constructor(private prisma: PrismaService) { }

    private readonly LABOUR_TYPES = [
        'Ploughing (Nangarni)',
        'Harvesting (Katni/Kapni)',
        'Transplanting (Ropani)',
        'Weeding (Nindai/Khurpi)',
        'Spraying (Fawarani)',
        'Cotton Picking',
        'Sugarcane Cutting',
        'Threshing',
        'General Labour',
        'Loading/Unloading (Hamali)',
        'Dairy Farming',
        'Fencing',
        'Other',
    ];

    getTypes() {
        return this.LABOUR_TYPES;
    }

    async getLeads(userId: string) {
        // Implement matching logic based on labour skills and location
        // For now, return empty array as we don't have a Leads table yet
        return [];
    }

    async getProfile(userId: string) {
        const profile = await this.prisma.labourProfile.findUnique({
            where: { userId },
            include: { user: true },
        });

        if (!profile) {
            // Return user info at least if profile doesn't exist yet
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw new NotFoundException('User not found');
            return { user, profile: null };
        }

        return {
            ...profile,
            pricePerDay: Number(profile.pricePerDay)
        };
    }

    async upsertProfile(userId: string, dto: CreateLabourProfileDto) {
        const { locationAddress, name, ...profileData } = dto;

        // Update user (location, name, and role)
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(locationAddress && { locationAddress }),
                ...(name && { name }),
                role: 'LABOUR' // Upgrade from GUEST to LABOUR
            },
        });

        const result = await this.prisma.labourProfile.upsert({
            where: { userId },
            create: {
                ...profileData,
                userId,
            },
            update: {
                ...profileData,
            },
            include: { user: true }
        });

        return {
            ...result,
            pricePerDay: Number(result.pricePerDay)
        };
    }

    async findAll() {
        const profiles = await this.prisma.labourProfile.findMany({
            include: { user: true }
        });
        return profiles.map(p => ({
            ...p,
            pricePerDay: Number(p.pricePerDay)
        }));
    }
    async findOne(id: string) {
        const profile = await this.prisma.labourProfile.findUnique({
            where: { id },
            include: { user: true },
        });
        if (!profile) throw new NotFoundException('Labourer not found');
        return {
            ...profile,
            pricePerDay: Number(profile.pricePerDay)
        };
    }
}
