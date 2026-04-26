import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
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
    const radiusKm = radius ?? 50;

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = ["m.status = 'AVAILABLE'"];

    if (category) {
      conditions.push(`m.category = $${paramIndex++}`);
      params.push(category);
    }
    if (brand) {
      conditions.push(`m.brand = $${paramIndex++}`);
      params.push(brand);
    }
    if (listingType) {
      conditions.push(`m."listingType" = $${paramIndex++}`);
      params.push(listingType);
    }
    if (rentUnit) {
      conditions.push(`m."rentUnit" = $${paramIndex++}`);
      params.push(rentUnit);
    }

    if (minPrice !== undefined) {
      conditions.push(`m.price >= $${paramIndex++}`);
      params.push(minPrice);
    }
    if (maxPrice !== undefined) {
      conditions.push(`m.price <= $${paramIndex++}`);
      params.push(maxPrice);
    }

    if (search) {
      conditions.push(`(
        m.brand ILIKE $${paramIndex} OR 
        m.model ILIKE $${paramIndex} OR 
        m.category ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    let distanceSelect = 'NULL::float as "distanceKm"';
    let distanceOrder = 'ORDER BY m."createdAt" DESC';

    if (lat != null && lng != null) {
      // Haversine formula — no PostGIS extension required
      const EARTH_RADIUS_KM = 6371;
      const distanceCalc = `(
        ${EARTH_RADIUS_KM} * 2 * asin(sqrt(
          pow(sin(radians(u."locationLat" - $${paramIndex}) / 2), 2) +
          cos(radians($${paramIndex})) * cos(radians(u."locationLat")) *
          pow(sin(radians(u."locationLng" - $${paramIndex + 1}) / 2), 2)
        ))
      )`;
      params.push(lat, lng);
      paramIndex += 2;

      distanceSelect = `${distanceCalc} as "distanceKm"`;

      conditions.push(`${distanceCalc} <= $${paramIndex++}`);
      params.push(radiusKm);

      distanceOrder = 'ORDER BY "distanceKm" ASC NULLS LAST';
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // phoneNumber is NOT selected in browse — privacy protection (DPDP compliance)
    // It is only revealed on the detail page after a booking is confirmed
    const sql = `
      SELECT m.*,
             u.name as "owner_name",
             u."locationLat" as "owner_lat", u."locationLng" as "owner_lng",
             ${distanceSelect}
      FROM "Machine" m
      JOIN "User" u ON m."ownerId" = u.id
      ${whereClause}
      ${distanceOrder}
    `;

    const rawMachines = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);

    return rawMachines.map((m) => ({
      ...m,
      price: Number(m.price),
      distanceKm: m.distanceKm ?? null,
      owner: {
        name: m.owner_name,
        // phoneNumber intentionally omitted from browse results
        locationLat: m.owner_lat,
        locationLng: m.owner_lng,
      }
    }));
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
