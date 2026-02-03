import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateMachineDto, MachineFilterDto } from './dto/machine.dto';

@Injectable()
export class MachinesService {
    constructor(private prisma: PrismaService) { }

    async createListing(ownerId: string, data: CreateMachineDto) {
        return this.prisma.machine.create({
            data: {
                ...data,
                ownerId,
            },
        });
    }

    async findAll(filters: MachineFilterDto) {
        const { category, listingType, minPrice, maxPrice } = filters;

        return this.prisma.machine.findMany({
            where: {
                category,
                listingType,
                price: {
                    gte: minPrice,
                    lte: maxPrice,
                },
                status: 'AVAILABLE',
            },
            include: {
                owner: {
                    select: {
                        name: true,
                        phoneNumber: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string) {
        return this.prisma.machine.findUnique({
            where: { id },
            include: {
                owner: true,
            },
        });
    }
}
