import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { CancelRequestDto } from './dto/cancel-request.dto';
import { ConfirmSuggestionDto } from './dto/confirm-suggestion.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { postgisDistanceKmSql, postgisWithinSql } from '../../common/utils/haversine.util';
import { TransportRequestCreatedEvent } from '../../events/types/system.events';

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

    // Fetch ALL per-farmer request dates in ONE query with CASE classification
    // (was 3 separate queries — 3× DB round-trips eliminated)
    type RequestRow = { vehicleId: string; requiredDate: Date; requestType: 'rejected' | 'pending' | 'active' };
    const farmerRequests: RequestRow[] = filters.userId
      ? await this.prisma.$queryRaw`
          SELECT "vehicleId", "requiredDate",
                 CASE
                   WHEN status = 'REJECTED'                                         THEN 'rejected'
                   WHEN status = 'SENT'                                             THEN 'pending'
                   WHEN status IN ('ACCEPTED','SCHEDULED','AWAITING_APPROVAL')      THEN 'active'
                 END AS "requestType"
          FROM "TransportRequest"
          WHERE "farmerId" = ${filters.userId}
            AND status IN ('REJECTED','SENT','ACCEPTED','SCHEDULED','AWAITING_APPROVAL')
        `
      : [];

    const rejectedDatesByVehicle = new Map<string, string[]>();
    const pendingDatesByVehicle  = new Map<string, string[]>();
    const activeDatesByVehicle   = new Map<string, string[]>();

    for (const r of farmerRequests) {
      const dateStr = r.requiredDate instanceof Date
        ? r.requiredDate.toISOString().split('T')[0]
        : String(r.requiredDate).split('T')[0];
      const map =
        r.requestType === 'rejected' ? rejectedDatesByVehicle :
        r.requestType === 'pending'  ? pendingDatesByVehicle  :
                                       activeDatesByVehicle;
      if (!map.has(r.vehicleId)) map.set(r.vehicleId, []);
      map.get(r.vehicleId)!.push(dateStr);
    }

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = [
      'u."isVerified" = true',
      'v."expiryDate" > NOW()'
    ];

    if (filters.vehicleTypes && filters.vehicleTypes.length > 0) {
      // Use ILIKE partial match so "Mini Truck" filter finds
      // "Mini Truck (Tata Ace / Bolero)" or any custom 'Other' type
      const orClauses = filters.vehicleTypes.map(
        () => `v."type" ILIKE $${paramIndex++}`
      ).join(' OR ');
      conditions.push(`(${orClauses})`);
      params.push(...filters.vehicleTypes.map(t => `%${t}%`));
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
      const distCalc   = postgisDistanceKmSql('u."locationLng"', 'u."locationLat"', `$${paramIndex}`, `$${paramIndex + 1}`);
      const withinExpr = postgisWithinSql('u."locationLng"', 'u."locationLat"', `$${paramIndex}`, `$${paramIndex + 1}`, `$${paramIndex + 2}`);
      params.push(filters.lng, filters.lat, filters.radius ?? 50);
      paramIndex += 3;

      distanceSelect = `${distCalc} as "distanceKm"`;
      conditions.push(`u."locationLat" IS NOT NULL AND u."locationLng" IS NOT NULL`);
      conditions.push(withinExpr);
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

    const vehicleIds = rawVehicles.map((v) => v.id);

    // Fetch upcoming blocked dates — limited to next 30 days to avoid fetching unbounded future dates
    const nowStart = new Date();
    nowStart.setHours(0, 0, 0, 0);
    const futureLimit = new Date(nowStart);
    futureLimit.setDate(futureLimit.getDate() + 30);

    const blockedEntries = vehicleIds.length > 0
      ? await this.prisma.vehicleAvailability.findMany({
          where: {
            vehicleId: { in: vehicleIds },
            date:      { gte: nowStart, lte: futureLimit },
            state:     { not: 'AVAILABLE' },
          },
          select: { vehicleId: true, date: true, state: true },
        })
      : [];
      
    const blockedDatesByVehicle = new Map<string, { date: string, state: string }[]>();
    for (const b of blockedEntries) {
      if (!blockedDatesByVehicle.has(b.vehicleId)) blockedDatesByVehicle.set(b.vehicleId, []);
      blockedDatesByVehicle.get(b.vehicleId)!.push({
        date: b.date.toISOString().split('T')[0],
        state: b.state
      });
    }

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
      // Dates (YYYY-MM-DD) this farmer was previously rejected for on this vehicle
      rejectedDates: rejectedDatesByVehicle.get(v.id) ?? [],
      // Dates (YYYY-MM-DD) this farmer already has a pending (SENT) request on this vehicle
      pendingDates: pendingDatesByVehicle.get(v.id) ?? [],
      // Dates (YYYY-MM-DD) this farmer already has an active request on this vehicle
      activeDates: activeDatesByVehicle.get(v.id) ?? [],
      // Dates the transporter manually marked as busy/maintenance/etc
      blockedDates: blockedDatesByVehicle.get(v.id) ?? [],
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
      const distCalc   = postgisDistanceKmSql('u."locationLng"', 'u."locationLat"', `$${paramIndex}`, `$${paramIndex + 1}`);
      const withinExpr = postgisWithinSql('u."locationLng"', 'u."locationLat"', `$${paramIndex}`, `$${paramIndex + 1}`, `$${paramIndex + 2}`);
      params.push(lng, lat, radius);
      paramIndex += 3;

      distanceSelect = `${distCalc} as "distanceKm"`;
      conditions.push(`u."locationLat" IS NOT NULL AND u."locationLng" IS NOT NULL`);
      conditions.push(withinExpr);
      distanceOrder = 'ORDER BY "distanceKm" ASC NULLS LAST';
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // phoneNumber excluded from browse — DPDP privacy protection
    // Phone is only revealed after a booking is ACCEPTED/SCHEDULED/COMPLETED
    const sql = `
      SELECT p.*,
             u.name as "user_name",
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
        // phoneNumber intentionally omitted from browse — shared after booking
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

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
      include: { transporter: { select: { userId: true } } },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const now = new Date();
    if (!vehicle.expiryDate || vehicle.expiryDate <= now) {
      throw new BadRequestException('This vehicle does not have an active subscription');
    }

    // ── Duplicate guard ─────────────────────────────────────────────────────
    // Normalise the requested date to midnight UTC so we can do a range check
    const reqDate = new Date(dto.requiredDate);
    const dayStart = new Date(Date.UTC(reqDate.getUTCFullYear(), reqDate.getUTCMonth(), reqDate.getUTCDate()));
    const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000); // next midnight

    const existing = await this.prisma.transportRequest.findFirst({
      where: {
        farmerId,
        vehicleId: dto.vehicleId,
        requiredDate: { gte: dayStart, lt: dayEnd },
        // Only block on active/pending statuses — allow re-request if previous was
        // REJECTED or CANCELLED
        status: { in: ['SENT', 'ACCEPTED', 'SCHEDULED', 'AWAITING_APPROVAL'] },
      },
    });

    if (existing) {
      const dateLabel = dayStart.toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
      });
      throw new BadRequestException(
        `You already have a pending request to this vehicle for ${dateLabel}. ` +
        `Please wait for the transporter's response or choose a different date.`
      );
    }
    // ── End duplicate guard ─────────────────────────────────────────────────

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

    this.eventEmitter.emit(
      'transport.request.created',
      new TransportRequestCreatedEvent(
        newReq.id,
        farmerId,
        dto.vehicleId,
        vehicle.transporter.userId,
      ),
    );
    return newReq;
  }

  async getTransporterRequests({
    userId,
    page = 1,
    limit = 100,
    statuses,
  }: {
    userId: string;
    page?: number;
    limit?: number;
    statuses?: string[];
  }) {
    const skip = (page - 1) * limit;
    const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], meta: { total: 0, page, limit, hasMore: false } };

    const whereClause: Prisma.TransportRequestWhereInput = {
      transporterId: profile.id,
      status: statuses?.length
        ? { in: statuses.map(s => s.toUpperCase()) as Prisma.EnumTransportRequestStatusFilter['in'] }
        : undefined,
    };

    const [total, requests] = await this.prisma.$transaction([
      this.prisma.transportRequest.count({ where: whereClause }),
      this.prisma.transportRequest.findMany({
        where: whereClause,
        include: {
          farmer: { select: { id: true, name: true, phoneNumber: true } },
          vehicle: { select: { id: true, type: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      })
    ]);

    // For each request, fetch the booked dates of its vehicle so the
    // transporter's date-picker can grey them out when suggesting a new date
    const vehicleIds = [...new Set(requests.map(r => r.vehicleId))];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookedRows = vehicleIds.length > 0
      ? await this.prisma.transportRequest.findMany({
          where: {
            vehicleId: { in: vehicleIds },
            status: { in: ['SCHEDULED', 'ACCEPTED'] },
            requiredDate: { gte: today },
          },
          select: { vehicleId: true, requiredDate: true, suggestedDate: true },
        })
      : [];

    // vehicleId → Set of YYYY-MM-DD booked date strings
    const bookedByVehicle = new Map<string, Set<string>>();
    for (const row of bookedRows) {
      if (!bookedByVehicle.has(row.vehicleId)) bookedByVehicle.set(row.vehicleId, new Set());
      const d = row.suggestedDate ?? row.requiredDate;
      bookedByVehicle.get(row.vehicleId)!.add(d.toISOString().split('T')[0]);
    }

    const mappedData = requests.map((req) => ({
      ...req,
      farmer: {
        ...req.farmer,
        phoneNumber: ['SCHEDULED', 'ACCEPTED', 'COMPLETED'].includes(req.status)
          ? req.farmer.phoneNumber
          : undefined,
      },
      // Array of YYYY-MM-DD strings where this vehicle is already booked
      vehicleBookedDates: [...(bookedByVehicle.get(req.vehicleId) ?? [])],
    }));

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        hasMore: skip + requests.length < total
      }
    };
  }

  async getFarmerRequests({
    farmerId,
    page = 1,
    limit = 100,
    statuses,
  }: {
    farmerId: string;
    page?: number;
    limit?: number;
    statuses?: string[];
  }) {
    const skip = (page - 1) * limit;

    const where: Prisma.TransportRequestWhereInput = {
      farmerId,
      status: statuses?.length
        ? { in: statuses.map(s => s.toUpperCase()) as Prisma.EnumTransportRequestStatusFilter['in'] }
        : undefined,
    };

    const requests = await this.prisma.transportRequest.findMany({
      where,
      // Flat select instead of 3-level nested include — eliminates N+1 query chains
      select: {
        id: true,
        status: true,
        pickup: true,
        drop: true,
        crop: true,
        quantity: true,
        requiredDate: true,
        suggestedDate: true,
        cancellationReason: true,
        createdAt: true,
        updatedAt: true,
        vehicle: {
          select: {
            id: true,
            type: true,
            model: true,
            capacity: true,
            operatingArea: true,
            transporter: {
              select: {
                user: { select: { name: true, phoneNumber: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const PHONE_VISIBLE_STATUSES = new Set(['SCHEDULED', 'ACCEPTED', 'COMPLETED']);

    return requests.map(req => ({
      ...req,
      transporter: {
        name: req.vehicle?.transporter?.user?.name ?? null,
        // Privacy gate — phone only after booking confirmed
        phoneNumber: PHONE_VISIBLE_STATUSES.has(req.status)
          ? (req.vehicle?.transporter?.user?.phoneNumber ?? null)
          : null,
      },
    }));
  }

  async respondToRequest(userId: string, requestId: string, dto: RespondRequestDto) {
    const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Transporter profile not found');

    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request || request.transporterId !== profile.id) throw new ForbiddenException('Unauthorized');

    // Only allow responding to SENT requests
    if (request.status !== 'SENT') {
      throw new BadRequestException(`Cannot respond to a request with status: ${request.status}`);
    }

    if (dto.action === 'accept') {
      const reqDate = new Date(request.requiredDate);
      const date = new Date(Date.UTC(reqDate.getUTCFullYear(), reqDate.getUTCMonth(), reqDate.getUTCDate()));
      await this.prisma.vehicleAvailability.upsert({
        where: { vehicleId_date: { vehicleId: request.vehicleId, date } },
        create: { vehicleId: request.vehicleId, date, state: 'BUSY' },
        update: { state: 'BUSY' },
      });
      const updated = await this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'SCHEDULED' } });
      // Notify farmer — request accepted
      this.notifications.createNotification({
        userId: request.farmerId,
        title: '✅ Transport Request Accepted',
        message: 'Your transport request has been accepted and is now scheduled.',
        type: 'SUCCESS',
        link: '/(farmer)/transport/my-requests',
      }).catch(() => { });
      return updated;
    }

    if (dto.action === 'reject') {
      const updated = await this.prisma.transportRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', rejectedAt: new Date() } });
      // Notify farmer — request rejected
      this.notifications.createNotification({
        userId: request.farmerId,
        title: '❌ Transport Request Rejected',
        message: 'Your transport request was declined by the transporter. Please try another vehicle.',
        type: 'WARNING',
        link: '/(farmer)/transport/search',
      }).catch(() => { });
      return updated;
    }

    if (dto.action === 'suggest') {
      if (!dto.suggestedDate) throw new BadRequestException('suggestedDate is required for suggest action');
      const suggestedDateParsed = new Date(dto.suggestedDate);
      if (isNaN(suggestedDateParsed.getTime())) throw new BadRequestException('Invalid suggestedDate format. Use YYYY-MM-DD.');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (suggestedDateParsed < today) throw new BadRequestException('Suggested date must be today or in the future');

      // Must suggest a DIFFERENT date from the farmer's original request
      const reqDateNorm = new Date(Date.UTC(
        request.requiredDate.getUTCFullYear(),
        request.requiredDate.getUTCMonth(),
        request.requiredDate.getUTCDate(),
      ));
      const sugNorm = new Date(Date.UTC(
        suggestedDateParsed.getUTCFullYear(),
        suggestedDateParsed.getUTCMonth(),
        suggestedDateParsed.getUTCDate(),
      ));
      if (sugNorm.getTime() === reqDateNorm.getTime()) {
        const dateLabel = reqDateNorm.toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
        });
        throw new BadRequestException(
          `${dateLabel} is the farmer's original requested date. Please suggest a different date.`,
        );
      }

      // Check if vehicle is already booked (SCHEDULED/ACCEPTED) on the suggested date
      const dayStart = new Date(Date.UTC(suggestedDateParsed.getUTCFullYear(), suggestedDateParsed.getUTCMonth(), suggestedDateParsed.getUTCDate()));
      const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const conflict = await this.prisma.transportRequest.findFirst({
        where: {
          vehicleId: request.vehicleId,
          id: { not: requestId }, // exclude the current request
          status: { in: ['SCHEDULED', 'ACCEPTED'] },
          OR: [
            { requiredDate: { gte: dayStart, lt: dayEnd } },
            { suggestedDate: { gte: dayStart, lt: dayEnd } },
          ],
        },
      });
      if (conflict) {
        const dateLabel = dayStart.toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
        });
        throw new BadRequestException(
          `Vehicle is already booked on ${dateLabel}. Please choose a different date.`,
        );
      }

      const updated = await this.prisma.transportRequest.update({ where: { id: requestId }, data: { suggestedDate: suggestedDateParsed } });
      // Notify farmer — transporter suggested a new date
      this.notifications.createNotification({
        userId: request.farmerId,
        title: '📅 New Date Suggested',
        message: `The transporter suggested a new date: ${dto.suggestedDate}. Please accept or decline.`,
        type: 'INFO',
        link: '/(farmer)/transport/my-requests',
      }).catch(() => { });
      return updated;
    }
  }

  async markRequestComplete(userId: string, requestId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Transport request not found');

    // Ownership check
    if (user.role === 'TRANSPORTER') {
      const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
      if (!profile || request.transporterId !== profile.id) {
        throw new ForbiddenException('Not authorized to update this request');
      }
      // Transporter can only mark SCHEDULED trips as AWAITING_APPROVAL
      if (request.status !== 'SCHEDULED') {
        throw new BadRequestException(`Trip must be in SCHEDULED state. Current: ${request.status}`);
      }
      const updated = await this.prisma.transportRequest.update({
        where: { id: requestId },
        data: { status: 'AWAITING_APPROVAL' },
      });
      // Notify farmer to confirm completion
      this.notifications.createNotification({
        userId: request.farmerId,
        title: '🏁 Trip Completed — Your Approval Needed',
        message: 'The transporter has marked this trip as done. Please confirm to release payment.',
        type: 'INFO',
        link: '/(farmer)/transport/my-requests',
      }).catch(() => { });
      return updated;
    } else {
      // Farmer can only approve AWAITING_APPROVAL trips
      if (request.farmerId !== userId) {
        throw new ForbiddenException('Not authorized to update this request');
      }
      if (request.status !== 'AWAITING_APPROVAL') {
        throw new BadRequestException(`Trip must be in AWAITING_APPROVAL state. Current: ${request.status}`);
      }
      const updated = await this.prisma.transportRequest.update({
        where: { id: requestId },
        data: { status: 'COMPLETED' },
      });

      // Reset vehicle status to AVAILABLE — both the calendar entry and the global flag
      const rawDate = request.suggestedDate ? new Date(request.suggestedDate) : new Date(request.requiredDate);
      const dateToFree = new Date(Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate()));
      await Promise.all([
        this.prisma.vehicleAvailability.updateMany({
          where: { vehicleId: request.vehicleId, date: dateToFree },
          data: { state: 'AVAILABLE' },
        }),
        this.prisma.vehicle.update({
          where: { id: request.vehicleId },
          data: { isAvailable: true },
        }),
      ]).catch(e => console.error('Failed to reset vehicle availability on completion', e));

      // Find transporter's userId to notify them
      const transporterProfile = await this.prisma.transporterProfile.findUnique({
        where: { id: request.transporterId },
        select: { userId: true },
      });
      if (transporterProfile) {
        this.notifications.createNotification({
          userId: transporterProfile.userId,
          title: '✅ Trip Confirmed Completed',
          message: 'The farmer has confirmed the trip is completed. Well done!',
          type: 'SUCCESS',
          link: '/(transporter)',
        }).catch(() => { });
      }
      return updated;
    }
  }

  async cancelTransportRequest(userId: string, requestId: string, dto: CancelRequestDto) {
    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Transport request not found');

    // Ownership check — both farmer and transporter (via profile) may cancel
    const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
    const isOwner = request.farmerId === userId || (profile && request.transporterId === profile.id);
    if (!isOwner) throw new ForbiddenException('Not authorized to cancel this request');

    // Only allow cancellation of active requests
    const cancellableStatuses = ['SENT', 'SCHEDULED', 'ACCEPTED', 'AWAITING_APPROVAL'];
    if (!cancellableStatuses.includes(request.status)) {
      throw new BadRequestException(`Cannot cancel a request with status: ${request.status}`);
    }

    const updated = await this.prisma.transportRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED', cancellationReason: dto.reason, cancelledById: userId },
    });

    // If the trip was already scheduled and is now cancelled, free up the vehicle's availability
    if (['SCHEDULED', 'ACCEPTED', 'AWAITING_APPROVAL'].includes(request.status)) {
      const rawDate = request.suggestedDate ? new Date(request.suggestedDate) : new Date(request.requiredDate);
      const dateToFree = new Date(Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate()));
      await Promise.all([
        this.prisma.vehicleAvailability.updateMany({
          where: { vehicleId: request.vehicleId, date: dateToFree },
          data: { state: 'AVAILABLE' },
        }),
        this.prisma.vehicle.update({
          where: { id: request.vehicleId },
          data: { isAvailable: true },
        }),
      ]).catch(e => console.error('Failed to reset vehicle availability on cancel', e));
    }

    // Notify the other party
    if (request.farmerId === userId) {
      // Farmer cancelled — notify transporter
      const transporterProfile = await this.prisma.transporterProfile.findUnique({
        where: { id: request.transporterId },
        select: { userId: true },
      });
      if (transporterProfile) {
        this.notifications.createNotification({
          userId: transporterProfile.userId,
          title: '🚫 Trip Cancelled by Farmer',
          message: `Reason: ${dto.reason}`,
          type: 'WARNING',
          link: '/(transporter)',
        }).catch(() => { });
      }
    } else {
      // Transporter cancelled — notify farmer
      this.notifications.createNotification({
        userId: request.farmerId,
        title: '🚫 Trip Cancelled by Transporter',
        message: `Reason: ${dto.reason}. Please find another transporter.`,
        type: 'WARNING',
        link: '/(farmer)/transport/search',
      }).catch(() => { });
    }

    return updated;
  }

  async confirmSuggestion(userId: string, requestId: string, dto: ConfirmSuggestionDto) {
    const request = await this.prisma.transportRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Transport request not found');

    // Only the farmer who owns this request can confirm a suggestion
    if (request.farmerId !== userId) throw new ForbiddenException('Not authorized');

    // Must be in SENT status with a suggestedDate
    if (request.status !== 'SENT') {
      throw new BadRequestException(`Request must be in SENT state to confirm suggestion. Current: ${request.status}`);
    }
    if (!request.suggestedDate) {
      throw new BadRequestException('No suggested date found on this request');
    }

    if (dto.accept) {
      // Mark vehicle as BUSY on the new suggested date
      const reqDate = new Date(request.suggestedDate);
      const date = new Date(Date.UTC(reqDate.getUTCFullYear(), reqDate.getUTCMonth(), reqDate.getUTCDate()));
      await this.prisma.vehicleAvailability.upsert({
        where: { vehicleId_date: { vehicleId: request.vehicleId, date } },
        create: { vehicleId: request.vehicleId, date, state: 'BUSY' },
        update: { state: 'BUSY' },
      });
      const updated = await this.prisma.transportRequest.update({
        where: { id: requestId },
        data: { status: 'SCHEDULED' },
      });
      // Notify transporter — farmer accepted the new date
      const transporterProfile = await this.prisma.transporterProfile.findUnique({
        where: { id: request.transporterId },
        select: { userId: true },
      });
      if (transporterProfile) {
        this.notifications.createNotification({
          userId: transporterProfile.userId,
          title: '✅ Date Suggestion Accepted',
          message: 'The farmer accepted your suggested date. The trip is now scheduled!',
          type: 'SUCCESS',
          link: '/(transporter)',
        }).catch(() => { });
      }
      return updated;
    } else {
      // Farmer declined the suggestion — cancel the request
      const updated = await this.prisma.transportRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED', cancellationReason: 'Farmer declined suggested date', cancelledById: userId },
      });
      // Notify transporter — farmer declined
      const transporterProfile = await this.prisma.transporterProfile.findUnique({
        where: { id: request.transporterId },
        select: { userId: true },
      });
      if (transporterProfile) {
        this.notifications.createNotification({
          userId: transporterProfile.userId,
          title: '❌ Date Suggestion Declined',
          message: 'The farmer declined your suggested date. The request has been cancelled.',
          type: 'WARNING',
          link: '/(transporter)',
        }).catch(() => { });
      }
      return updated;
    }
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
