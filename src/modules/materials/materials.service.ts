import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateFarmerMaterialDto, BrowseMaterialsDto } from './dto/material.dto';
import { postgisDistanceKmSql, postgisWithinSql } from '../../common/utils/haversine.util';
import { RedisService } from '../../database/redis/redis.service';

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async createMaterial(farmerId: string, data: CreateFarmerMaterialDto) {
    return this.prisma.farmerMaterial.create({
      data: {
        farmerId,
        materialName: data.materialName,
        photoUrl: data.photoUrl,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async browseMaterials(query: BrowseMaterialsDto) {
    const page   = query.page  || 1;
    const limit  = query.limit || 15;
    const offset = (page - 1) * limit;
    const search = query.searchQuery?.trim();

    // 30s Redis cache — absorbs repeat taps without extra DB load
    const cacheKey = `materials:browse:${JSON.stringify({ ...query, page, limit })}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached as string);

    let result: any;

    // Use PostGIS raw query when coords provided (distance sort + radius filter)
    // Fall back to Prisma findMany when no location given
    if (query.lat != null && query.lng != null) {
      result = await this.browseMaterialsWithPostgis(query.lat, query.lng, page, limit, offset, search, query.radius ?? 50);
    } else {

    const where: any = {
      expiresAt: { gt: new Date() },
      ...(search && { materialName: { contains: search, mode: 'insensitive' } }),
    };

    const [materials, total] = await Promise.all([
      this.prisma.farmerMaterial.findMany({
        where,
        include: {
          farmer: {
            select: {
              id: true, name: true,
              phoneNumber: true, // materials is public classifieds — seller chose to list
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.farmerMaterial.count({ where }),
    ]);

      result = {
        data: materials.map((m) => ({
          id: m.id,
          materialName: m.materialName,
          photoUrl: m.photoUrl,
          createdAt: m.createdAt,
          farmer: { id: m.farmer.id, name: m.farmer.name },
          distanceKm: null,
        })),
        meta: { total, page, limit, hasMore: offset + materials.length < total },
      };
    }

    this.redis.set(cacheKey, JSON.stringify(result), 30).catch(() => { /* non-critical */ });
    return result;
  }

  // PostGIS-powered browse — sorts by real geodesic distance, filters by radius
  private async browseMaterialsWithPostgis(
    lat: number, lng: number,
    page: number, limit: number, offset: number,
    search?: string,
    radius = 50,   // km — was accidentally referencing out-of-scope `query.radius`
  ) {
    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = [`fm."expiresAt" > NOW()`];

    if (search) {
      conditions.push(`fm."materialName" ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    // Only rows where the farmer has a location set
    conditions.push(`u."locationLat" IS NOT NULL AND u."locationLng" IS NOT NULL`);

    const distCalc   = postgisDistanceKmSql('u."locationLng"', 'u."locationLat"', `$${paramIndex}`, `$${paramIndex + 1}`);
    const withinExpr = postgisWithinSql('u."locationLng"', 'u."locationLat"', `$${paramIndex}`, `$${paramIndex + 1}`, `$${paramIndex + 2}`);
    params.push(lng, lat, radius); // passed from caller; default 50 km
    paramIndex += 3;

    conditions.push(withinExpr);
    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countParams = [...params];
    const dataSql = `
      SELECT fm.id, fm."materialName", fm."photoUrl", fm."createdAt",
             u.id as "farmerId", u.name as "farmerName",
             u."phoneNumber" as "farmerPhone",
             ROUND(u."locationLat"::numeric, 2) as "farmerLat",
             ROUND(u."locationLng"::numeric, 2) as "farmerLng",
             ${distCalc} as "distanceKm"
      FROM "FarmerMaterial" fm
      JOIN "User" u ON u.id = fm."farmerId"
      ${whereClause}
      ORDER BY "distanceKm" ASC NULLS LAST
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const countSql = `
      SELECT COUNT(*) as total
      FROM "FarmerMaterial" fm
      JOIN "User" u ON u.id = fm."farmerId"
      ${whereClause}
    `;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(dataSql, ...params),
      this.prisma.$queryRawUnsafe<{ total: string }[]>(countSql, ...countParams),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
      data: rows.map((r) => ({
        id: r.id,
        materialName: r.materialName,
        photoUrl: r.photoUrl,
        createdAt: r.createdAt,
        // Materials is a public classifieds marketplace — sellers choose to list publicly
        farmer: { id: r.farmerId, name: r.farmerName, phoneNumber: r.farmerPhone },
        // Approximate coords (2dp ≈ 1.1km precision) for navigation
        farmerLat: r.farmerLat != null ? Number(r.farmerLat) : null,
        farmerLng: r.farmerLng != null ? Number(r.farmerLng) : null,
        distanceKm: r.distanceKm != null ? Math.round(Number(r.distanceKm) * 10) / 10 : null,
      })),
      meta: { total, page, limit, hasMore: offset + rows.length < total },
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
      data: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
  }

  async deleteMaterial(farmerId: string, id: string) {
    const material = await this.prisma.farmerMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');
    if (material.farmerId !== farmerId) throw new UnauthorizedException('Not authorized');

    return this.prisma.farmerMaterial.delete({ where: { id } });
  }
}
