import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class LocationService {
    constructor(private prisma: PrismaService) { }

    async getStates() {
        return this.prisma.state.findMany({
            orderBy: { name: 'asc' },
        });
    }

    async getDistricts(stateId: string) {
        return this.prisma.district.findMany({
            where: { stateId },
            orderBy: { name: 'asc' },
        });
    }

    async getTalukas(districtId: string) {
        return this.prisma.taluka.findMany({
            where: { districtId },
            orderBy: { name: 'asc' },
        });
    }

    async getVillages(talukaId: string) {
        return this.prisma.village.findMany({
            where: { talukaId },
            orderBy: { name: 'asc' },
        });
    }

    // Helper for finding IDs by name (used during auto-fill or seeding)
    async findStateByName(name: string) {
        return this.prisma.state.findUnique({ where: { name } });
    }

    async findDistrictByName(stateId: string, name: string) {
        return this.prisma.district.findUnique({
            where: {
                name_stateId: { name, stateId },
            },
        });
    }
}
