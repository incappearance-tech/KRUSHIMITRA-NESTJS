import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateMachineDto, MachineFilterDto } from './dto/machine.dto';

@Injectable()
export class MachinesService {
  constructor(private prisma: PrismaService) {}

  async createListing(ownerId: string, data: CreateMachineDto) {
    return this.prisma.machine.create({
      data: {
        ...data,
        ownerId,
      },
    });
  }

  async findAll(filters: MachineFilterDto) {
    const {
      category,
      brand,
      search,
      listingType,
      minPrice,
      maxPrice,
      rentUnit,
      lat,
      lng,
      radius,
    } = filters;
    const radiusKm = radius ?? 10;

    const where: any = {
      status: 'AVAILABLE',
    };

    if (category) where.category = category;
    if (brand) where.brand = brand;
    if (listingType) where.listingType = listingType;
    if (rentUnit) where.rentUnit = rentUnit;

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

    const machines = await this.prisma.machine.findMany({
      where,
      include: {
        owner: {
          select: {
            name: true,
            phoneNumber: true,
            locationLat: true,
            locationLng: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // If location is provided, annotate with distance and sort nearest-first
    if (lat != null && lng != null) {
      const haversine = (
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number,
      ): number => {
        const R = 6371; // Earth radius in km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const withDistance = machines
        .map((m) => {
          const ownerLat: number | null = (m.owner as any)?.locationLat ?? null;
          const ownerLng: number | null = (m.owner as any)?.locationLng ?? null;
          const distanceKm =
            ownerLat != null && ownerLng != null
              ? haversine(lat, lng, ownerLat, ownerLng)
              : null;
          return { ...m, distanceKm };
        })
        .filter((m) => m.distanceKm == null || m.distanceKm <= radiusKm)
        .sort((a, b) => {
          if (a.distanceKm == null && b.distanceKm == null) return 0;
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;
        });

      return withDistance;
    }

    return machines;
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
      select: { category: true },
      distinct: ['category'],
    });
    return categories.map((c) => c.category);
  }

  async findMine(ownerId: string) {
    return this.prisma.machine.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, ownerId: string, data: Partial<CreateMachineDto>) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    return this.prisma.machine.update({ where: { id }, data });
  }

  async remove(id: string, ownerId: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    await this.prisma.machine.delete({ where: { id } });
    return { success: true, message: 'Listing deleted' };
  }

  async toggle(id: string, ownerId: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    const newStatus = machine.status === 'AVAILABLE' ? 'IN_RENT' : 'AVAILABLE';
    return this.prisma.machine.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  async setPlan(id: string, ownerId: string, plan: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    const planExpiresAt = new Date();
    planExpiresAt.setDate(planExpiresAt.getDate() + 30); // 30-day plan

    return this.prisma.machine.update({
      where: { id },
      data: { plan, planExpiresAt },
    });
  }
}
