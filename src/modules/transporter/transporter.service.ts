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

    // Fetch ALL rejected requests for this farmer so we can return per-vehicle blocked dates
    // (no longer hiding the vehicle — only block the specific rejected date on the frontend)
    const rejectedRequests = filters.userId
      ? await this.prisma.transportRequest.findMany({
          where: { farmerId: filters.userId, status: 'REJECTED' },
          select: { transporterId: true, requiredDate: true, vehicleId: true },
        })
      : [];

    const pendingRequests = filters.userId
      ? await this.prisma.transportRequest.findMany({
          where: { farmerId: filters.userId, status: 'SENT' },
          select: { vehicleId: true, requiredDate: true },
        })
      : [];

    const activeRequests = filters.userId
      ? await this.prisma.transportRequest.findMany({
          where: { 
            farmerId: filters.userId, 
            status: { in: ['ACCEPTED', 'SCHEDULED', 'AWAITING_APPROVAL'] } 
          },
          select: { vehicleId: true, requiredDate: true },
        })
      : [];

    // Map: vehicleId -> array of YYYY-MM-DD strings that were rejected
    const rejectedDatesByVehicle = new Map<string, string[]>();
    for (const r of rejectedRequests) {
      const dateStr = r.requiredDate.toISOString().split('T')[0];
      if (!rejectedDatesByVehicle.has(r.vehicleId)) {
        rejectedDatesByVehicle.set(r.vehicleId, []);
      }
      rejectedDatesByVehicle.get(r.vehicleId)!.push(dateStr);
    }

    // Map: vehicleId -> array of YYYY-MM-DD strings with a pending (SENT) request
    const pendingDatesByVehicle = new Map<string, string[]>();
    for (const r of pendingRequests) {
      const dateStr = r.requiredDate.toISOString().split('T')[0];
      if (!pendingDatesByVehicle.has(r.vehicleId)) {
        pendingDatesByVehicle.set(r.vehicleId, []);
      }
      pendingDatesByVehicle.get(r.vehicleId)!.push(dateStr);
    }

    // Map: vehicleId -> array of YYYY-MM-DD strings with an active request
    const activeDatesByVehicle = new Map<string, string[]>();
    for (const r of activeRequests) {
      const dateStr = r.requiredDate.toISOString().split('T')[0];
      if (!activeDatesByVehicle.has(r.vehicleId)) {
        activeDatesByVehicle.set(r.vehicleId, []);
      }
      activeDatesByVehicle.get(r.vehicleId)!.push(dateStr);
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
      // Haversine formula — no PostGIS extension required
      const EARTH_RADIUS_KM = 6371;
      const distanceCalc = `(
        ${EARTH_RADIUS_KM} * 2 * asin(sqrt(
          pow(sin(radians(u."locationLat" - $${paramIndex}) / 2), 2) +
          cos(radians($${paramIndex})) * cos(radians(u."locationLat")) *
          pow(sin(radians(u."locationLng" - $${paramIndex + 1}) / 2), 2)
        ))
      )`;
      params.push(filters.lat, filters.lng);
      paramIndex += 2;

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

    const vehicleIds = rawVehicles.map((v) => v.id);

    // Fetch upcoming blocked dates (calendar)
    const nowStart = new Date();
    nowStart.setHours(0,0,0,0);
    const blockedEntries = vehicleIds.length > 0
      ? await this.prisma.vehicleAvailability.findMany({
          where: { vehicleId: { in: vehicleIds }, date: { gte: nowStart }, state: { not: 'AVAILABLE' } },
          select: { vehicleId: true, date: true, state: true }
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

  async getTransporterRequests({ userId, page = 1, limit = 100, statuses }: any) {
    const skip = (page - 1) * limit;
    const profile = await this.prisma.transporterProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], meta: { total: 0, page, limit, hasMore: false } };

    const whereClause: any = { transporterId: profile.id };
    if (statuses && statuses.length > 0) {
      whereClause.status = { in: statuses.map((s: string) => s.toUpperCase()) };
    }

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

    const mappedData = requests.map((req) => ({
      ...req,
      farmer: {
        ...req.farmer,
        phoneNumber: ['SCHEDULED', 'ACCEPTED', 'COMPLETED'].includes(req.status)
          ? req.farmer.phoneNumber
          : undefined,
      },
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
      if (suggestedDateParsed < new Date()) throw new BadRequestException('Suggested date must be in the future');
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
