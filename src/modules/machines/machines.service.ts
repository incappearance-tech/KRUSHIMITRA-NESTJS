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
        const { category, brand, search, listingType, minPrice, maxPrice, rentUnit } = filters;

        const where: any = {
            status: 'AVAILABLE',
        };

        if (category) {
            where.category = category;
        }

        if (brand) {
            where.brand = brand;
        }

        if (listingType) {
            where.listingType = listingType;
        }

        if (rentUnit) {
            where.rentUnit = rentUnit;
        }

        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = {};
            if (minPrice !== undefined) where.price.gte = minPrice;
            if (maxPrice !== undefined) where.price.lte = maxPrice;
        }

        if (search) {
            where.OR = [
                { brand: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
            ];
        }

        return this.prisma.machine.findMany({
            where,
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
                owner: {
                    select: {
                        id: true,
                        name: true,
                        phoneNumber: true,
                        locationLat: true,
                        locationLng: true,
                        createdAt: true,
                    },
                },
            },
        });
    }

    async getCategories() {
        const categories = await this.prisma.machine.findMany({
            select: {
                category: true,
            },
            distinct: ['category'],
        });
        return categories.map((c) => c.category);
    }
}
