import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class LocationService {
    constructor(private prisma: PrismaService) { }

    async getStates() {
        return [];
    }

    async getDistricts(stateId: string) {
        return [];
    }

    async getTalukas(districtId: string) {
        return [];
    }

    async getVillages(talukaId: string) {
        return [];
    }

    async findStateByName(name: string) {
        return null;
    }

    async findDistrictByName(stateId: string, name: string) {
        return null;
    }
}
