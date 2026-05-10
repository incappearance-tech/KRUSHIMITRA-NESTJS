import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateFarmerMaterialDto, BrowseMaterialsDto } from './dto/material.dto';

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);
  constructor(private prisma: PrismaService) {}

  async createMaterial(farmerId: string, data: CreateFarmerMaterialDto) {
    return this.prisma.farmerMaterial.create({
      data: {
        farmerId,
        materialName: data.materialName,
        photoUrl: data.photoUrl,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      },
    });
  }

  async browseMaterials(query: BrowseMaterialsDto) {
    const page   = query.page  || 1;
    const limit  = query.limit || 15;
    const offset = (page - 1) * limit;
    const search = query.searchQuery?.trim();

    // Build shared WHERE — active listings + optional name search
    const where: any = {
      expiresAt: { gt: new Date() },
      ...(search && {
        materialName: { contains: search, mode: 'insensitive' },
      }),
    };

    // Fetch materials with farmer details
    const materials = await this.prisma.farmerMaterial.findMany({
      where,
      include: {
        farmer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            locationLat: true,
            locationLng: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], // stable: id breaks ties when createdAt is equal
      skip: offset,
      take: limit,
    });

    const total = await this.prisma.farmerMaterial.count({ where });

    // Map and calculate distance if coordinates are provided
    const mapped = materials.map((m) => {
      let distanceKm = null;
      if (query.lat && query.lng && m.farmer.locationLat && m.farmer.locationLng) {
        distanceKm = this.calculateDistance(
          query.lat,
          query.lng,
          m.farmer.locationLat,
          m.farmer.locationLng,
        );
      }

      return {
        id: m.id,
        materialName: m.materialName,
        photoUrl: m.photoUrl,
        createdAt: m.createdAt,
        farmer: {
          id: m.farmer.id,
          name: m.farmer.name,
          phoneNumber: m.farmer.phoneNumber,
        },
        distanceKm,
      };
    });

    // Sort by distance if location provided
    if (query.lat && query.lng) {
      mapped.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    return {
      data: mapped,
      meta: {
        total,
        page,
        limit,
        hasMore: offset + mapped.length < total,
      },
    };
  }

  async getMyMaterials(farmerId: string) {
    return this.prisma.farmerMaterial.findMany({
      where: { farmerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async renewMaterial(farmerId: string, id: string) {
    const material = await this.prisma.farmerMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');
    if (material.farmerId !== farmerId) throw new UnauthorizedException('Not authorized');

    return this.prisma.farmerMaterial.update({
      where: { id },
      data: {
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async deleteMaterial(farmerId: string, id: string) {
    const material = await this.prisma.farmerMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');
    if (material.farmerId !== farmerId) throw new UnauthorizedException('Not authorized');

    return this.prisma.farmerMaterial.delete({
      where: { id },
    });
  }

  // Haversine formula
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
