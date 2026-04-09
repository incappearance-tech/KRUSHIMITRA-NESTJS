import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { CancelRequestDto } from './dto/cancel-request.dto';
import { ConfirmSuggestionDto } from './dto/confirm-suggestion.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { NotificationsService } from '../../common/notifications/notifications.service';

@Injectable()
export class TransporterService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private eventEmitter: EventEmitter2
  ) { }

  // ─────────────────────────────────────────────────────────────
  //  LEADS (legacy TransportTrip flow)
  // ─────────────────────────────────────────────────────────────

  async getLeads(userId: string) {
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
    });
    if (!profile) return [];

    const leads = await this.prisma.transportTrip.findMany({
      where: { transporterId: profile.id },
      orderBy: { date: 'desc' },
    });
    return leads;
  }

  async updateLeadStatus(userId: string, tripId: string, status: string) {
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Transporter profile not found');

    const trip = await this.prisma.transportTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip)
      throw new NotFoundException(
        'This trip no longer exists. Please refresh your leads list.',
      );
    if (trip.transporterId !== profile.id)
      throw new ForbiddenException(
        'You are not authorized to update this trip.',
      );

    return this.prisma.transportTrip.update({
      where: { id: tripId },
      data: { status },
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  FARMER-FACING VEHICLE BROWSE (Privacy-safe & PostGIS)
  // ─────────────────────────────────────────────────────────────

  async getVehiclesForFarmer(filters: {
    userId?: string;
    vehicleTypes?: string[];
    minCapacity?: number;
    lat?: number;
    lng?: number;
    radius?: number;
    requiredDate?: string;
    page?: number;
    limit?: number;
    searchQuery?: string;
    minRating?: number;
    maxPrice?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;
    const now = new Date();

    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentRejections = filters.userId ? await this.prisma.transportRequest.findMany({
      where: {
        farmerId: filters.userId,
        status: 'REJECTED',
        updatedAt: { gte: oneDayAgo }
      },
      select: { transporterId: true }
    }) : [];

    const rejectedTransporterIds = recentRejections.map(r => r.transporterId);

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = [
      'u."isVerified" = true',
      'v."expiryDate" > NOW()'
    ];

    if (rejectedTransporterIds.length > 0) {
      const placeholders = rejectedTransporterIds.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`v."transporterId" NOT IN (${placeholders})`);
      params.push(...rejectedTransporterIds);
    }

    if (filters.vehicleTypes && filters.vehicleTypes.length > 0) {
      const typePlaceholders = filters.vehicleTypes.map(() => `$${paramIndex++}`).join(', ');
      conditions.push(`v."type" IN (${typePlaceholders})`);
      params.push(...filters.vehicleTypes);
    }

    if (filters.searchQuery) {
      conditions.push(`(
        v."model" ILIKE $${paramIndex} OR 
        v."type" ILIKE $${paramIndex} OR 
        t."businessName" ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.searchQuery}%`);
      paramIndex++;
    }

    if (filters.minRating !== undefined) {
      conditions.push(`v."rating" >= $${paramIndex++}`);
      params.push(filters.minRating);
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(`v."ratePerKm" <= $${paramIndex++}`);
      params.push(filters.maxPrice);
    }

    let distanceSelect = 'NULL::float as "distanceKm"';
    let distanceOrder = 'ORDER BY v."createdAt" DESC';

    if (filters.lat != null && filters.lng != null) {
      const userPoint = `ST_SetSRID(ST_MakePoint(u."locationLng", u."locationLat"), 4326)`;
      const searchPoint = `ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)`;
      params.push(filters.lng, filters.lat);

      const distanceCalc = `(ST_DistanceSphere(${userPoint}, ${searchPoint}) / 1000.0)`;
      distanceSelect = `${distanceCalc} as "distanceKm"`;

      conditions.push(`${distanceCalc} <= $${paramIndex++}`);
      params.push(filters.radius || 50);

      distanceOrder = 'ORDER BY "distanceKm" ASC NULLS LAST';
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT v.*,
             u."name" as "driverName", u.id as "transporterUserId",
             u."locationLat" as "transporterLat", u."locationLng" as "transporterLng",
             t."businessName",
             ${distanceSelect},
             COALESCE(tc.count, 0) as "tripCount"
      FROM "Vehicle" v
      JOIN "TransporterProfile" t ON v."transporterId" = t.id
      JOIN "User" u ON t."userId" = u.id
      LEFT JOIN (
        SELECT "vehicleId", COUNT(*) as count 
        FROM "TransportRequest" 
        WHERE status = 'COMPLETED' 
        GROUP BY "vehicleId"
      ) tc ON tc."vehicleId" = v.id
      ${whereClause}
      ${distanceOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM "Vehicle" v
      JOIN "TransporterProfile" t ON v."transporterId" = t.id
      JOIN "User" u ON t."userId" = u.id
      ${whereClause}
    `;

    const countParams = [...params];
    params.push(limit, offset);

    const rawVehicles = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const countResult = await this.prisma.$queryRawUnsafe<any[]>(countSql, ...countParams);
    const total = Number(countResult[0]?.total || 0);

    const mapped = rawVehicles.map((v) => ({
      ...v,
      ratePerKm: v.ratePerKm ? Number(v.ratePerKm) : null,
      tripCount: Number(v.tripCount) || 0,
      transporter: {
        id: v.transporterId,
        businessName: v.businessName,
        user: {
          id: v.transporterUserId,
          name: v.driverName,
          locationLat: v.transporterLat,
          locationLng: v.transporterLng,
        }
      },
      distanceKm: v.distanceKm ?? null,
    }));

    return {
      data: mapped,
      meta: { total, page, limit, hasMore: offset + mapped.length < total }
    };
  }

  async findAll(lat?: number, lng?: number, radius = 50) {
    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = ['u."isVerified" = true'];

    let distanceSelect = 'NULL::float as "distanceKm"';
    let distanceOrder = 'ORDER BY p."createdAt" DESC';

    if (lat != null && lng != null) {
      const userPoint = `ST_SetSRID(ST_MakePoint(u."locationLng", u."locationLat"), 4326)`;
      const searchPoint = `ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)`;
      params.push(lng, lat);

      const distanceCalc = `(ST_DistanceSphere(${userPoint}, ${searchPoint}) / 1000.0)`;
      distanceSelect = `${distanceCalc} as "distanceKm"`;

      conditions.push(`${distanceCalc} <= $${paramIndex++}`);
      params.push(radius);

      distanceOrder = 'ORDER BY "distanceKm" ASC NULLS LAST';
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT p.*,
             u.name as "user_name", u."phoneNumber" as "user_phone",
             u."locationLat" as "user_lat", u."locationLng" as "user_lng",
             ${distanceSelect}
      FROM "TransporterProfile" p
      JOIN "User" u ON p."userId" = u.id
      ${whereClause}
      ${distanceOrder}
    `;

    const rawProfiles = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const transporterIds = rawProfiles.map(p => p.id);
    const vehicles = await this.prisma.vehicle.findMany({
      where: { transporterId: { in: transporterIds } }
    });

    return rawProfiles.map((p) => ({
      ...p,
      distanceKm: p.distanceKm ?? null,
      user: {
        name: p.user_name,
        phoneNumber: p.user_phone,
        locationLat: p.user_lat,
        locationLng: p.user_lng,
      },
      vehicles: vehicles
        .filter(v => v.transporterId === p.id)
        .map(v => ({
          ...v,
          ratePerKm: v.ratePerKm ? Number(v.ratePerKm) : null
        }))
    }));
  }

  // ─────────────────────────────────────────────────────────────
  //  TRANSPORT REQUEST (farmer → transporter flow)
  // ─────────────────────────────────────────────────────────────

  async createTransportRequest(farmerId: string, dto: CreateTransportRequestDto) {
    const farmer = await this.prisma.user.findUnique({ where: { id: farmerId } });
    if (!farmer) throw new NotFoundException('Farmer not found');

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const now = new Date();
    if (!vehicle.expiryDate || vehicle.expiryDate <= now) {
      throw new BadRequestException('This vehicle does not have an active subscription');
    }

    const newReq = await this.prisma.transportRequest.create({
      data: {
        farmerId,
        vehicleId: dto.vehicleId,
        transporterId: dto.transporterId,
        pickup: dto.pickup,
        drop: dto.drop,
        crop: dto.crop,
        quantity: dto.quantity,
        requiredDate: new Date(dto.requiredDate),
        status: 'SENT',
      }
    });

    this.eventEmitter.emit('transport.request.created', { requestId: newReq.id });
    return newReq;
  }

  async getTransporterRequests(userId: string) {
    const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
    if (!profile) return [];

    const requests = await this.prisma.transportRequest.findMany({
      where: { transporterId: profile.id },
      include: {
        farmer: { select: { id: true, name: true, phoneNumber: true } },
        vehicle: { select: { id: true, type: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((req) => ({
      ...req,
      farmer: {
        ...req.farmer,
        phoneNumber: ['SCHEDULED', 'ACCEPTED', 'COMPLETED'].includes(req.status)
          ? req.farmer.phoneNumber
          : undefined,
      },
    }));
  }

  async getFarmerRequests({ farmerId, page = 1, limit = 100, statuses }: any) {
    const skip = (page - 1) * limit;
    const whereClause: any = { farmerId };
    if (statuses?.length > 0) whereClause.status = { in: statuses.map((s: string) => s.toUpperCase()) };

    const requests = await this.prisma.transportRequest.findMany({
      where: whereClause,
      include: {
        vehicle: {
          include: {
            transporter: { include: { user: { select: { name: true, phoneNumber: true } } } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return requests.map((req) => ({
      ...req,
      transporter: {
        name: req.vehicle.transporter.user.name,
        phoneNumber: ['SCHEDULED', 'ACCEPTED', 'COMPLETED'].includes(req.status)
          ? req.vehicle.transporter.user.phoneNumber
          : null,
      },
    }));
  }

  async respondToRequest(userId: string, requestId: string, dto: RespondRequestDto) {
    const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Transporter profile not found');

    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request || request.transporterId !== profile.id) throw new ForbiddenException('Unauthorized');

    if (dto.action === 'accept') {
      const date = new Date(request.requiredDate);
      date.setHours(0, 0, 0, 0);
      await this.prisma.vehicleAvailability.upsert({
        where: { vehicleId_date: { vehicleId: request.vehicleId, date } },
        create: { vehicleId: request.vehicleId, date, state: 'BUSY' },
        update: { state: 'BUSY' },
      });
      return this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'SCHEDULED' } });
    }

    if (dto.action === 'reject') {
      return this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', rejectedAt: new Date() } });
    }

    if (dto.action === 'suggest') {
      return this.prisma.transportRequest.update({ where: { id: requestId }, data: { suggestedDate: new Date(dto.suggestedDate!) } });
    }
  }

  async markRequestComplete(userId: string, requestId: string) {
    return this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'COMPLETED' } });
  }

  async cancelTransportRequest(userId: string, requestId: string, dto: CancelRequestDto) {
    return this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', cancellationReason: dto.reason, cancelledById: userId } });
  }

  async confirmSuggestion(userId: string, requestId: string, dto: ConfirmSuggestionDto) {
    const status = dto.accept ? 'SCHEDULED' : 'CANCELLED';
    return this.prisma.transportRequest.update({ where: { id: requestId }, data: { status } });
  }

  async getFarmerTrips(farmerId: string) {
    return this.prisma.transportTrip.findMany({ where: { farmerId }, orderBy: { date: 'desc' } });
  }

  async bookTrip(farmerId: string, dto: CreateTripDto) {
    const farmer = await this.prisma.user.findUnique({
      where: { id: farmerId },
      select: { name: true, phoneNumber: true },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');

    return this.prisma.transportTrip.create({
      data: {
        ...dto,
        farmerId,
        farmerName: farmer.name || 'Unknown',
        farmerPhone: farmer.phoneNumber,
        status: 'pending',
      },
    });
  }
}
