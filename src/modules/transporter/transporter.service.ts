import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateTransporterProfileDto } from './dto/transporter-profile.dto';
import { CreateVehicleDto } from './dto/vehicle.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { SetAvailabilityDto } from './dto/vehicle-availability.dto';
import { NotificationsService } from '../../common/notifications/notifications.service';

@Injectable()
export class TransporterService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService
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
  //  TRANSPORTER PROFILE
  // ─────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
      include: { user: true, vehicles: true },
    });

    if (!profile) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      return { user, profile: null };
    }

    const leadsReceived = await this.prisma.transportTrip.count({
      where: { transporterId: profile.id },
    });
    const tripsCompleted = await this.prisma.transportTrip.count({
      where: { transporterId: profile.id, status: 'completed' },
    });

    return {
      ...profile,
      leadsReceived,
      tripsCompleted,
      vehicles: profile.vehicles.map(v => ({
        ...v,
        ratePerKm: v.ratePerKm ? Number(v.ratePerKm) : null
      }))
    };
  }

  async getTransporterById(id: string) {
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { id },
      include: { user: true, vehicles: true },
    });
    if (!profile) throw new NotFoundException('Transporter not found');

    const tripsCompleted = await this.prisma.transportTrip.count({
      where: { transporterId: profile.id, status: 'completed' },
    });
    return { ...profile, tripsCompleted };
  }

  async upsertProfile(userId: string, dto: CreateTransporterProfileDto) {
    const {
      locationAddress,
      state,
      district,
      taluka,
      village,
      pincode,
      ...profileData
    } = dto;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        locationAddress: locationAddress || undefined,
        state: state || undefined,
        district: district || undefined,
        taluka: taluka || undefined,
        village: village || undefined,
        pincode: pincode || undefined,
        name: profileData.businessName || undefined,
        role: 'TRANSPORTER',
      },
    });

    return this.prisma.transporterProfile.upsert({
      where: { userId },
      create: { ...profileData, userId },
      update: { ...profileData },
      include: { user: true, vehicles: true },
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  VEHICLE CRUD
  // ─────────────────────────────────────────────────────────────

  async addVehicle(userId: string, dto: CreateVehicleDto) {
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
      include: { vehicles: { select: { id: true } } },
    });
    if (!profile) throw new NotFoundException('Transporter profile not found');

    // Enforce single-use free trial: only valid for the very first vehicle
    if (dto.plan === 'free' && profile.vehicles.length > 0) {
      throw new BadRequestException(
        'Free trial is only available for your first vehicle addition.',
      );
    }

    const { expiryDate, ...vehicleData } = dto;

    const vehicle = await this.prisma.vehicle.create({
      data: {
        ...vehicleData,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        transporterId: profile.id,
      },
    });

    return {
      ...vehicle,
      ratePerKm: vehicle.ratePerKm ? Number(vehicle.ratePerKm) : null
    };
  }

  async deleteVehicle(userId: string, vehicleId: string) {
    // Safety check: no active subscription or future bookings
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const now = new Date();
    if (vehicle.expiryDate && vehicle.expiryDate > now) {
      throw new BadRequestException(
        'Cannot delete vehicle with an active subscription',
      );
    }

    const futureRequests = await this.prisma.transportRequest.count({
      where: {
        vehicleId,
        requiredDate: { gte: now },
        status: { in: ['SENT', 'ACCEPTED', 'SCHEDULED'] },
      },
    });
    if (futureRequests > 0)
      throw new BadRequestException(
        'Cannot delete vehicle with future bookings',
      );

    return this.prisma.vehicle.delete({ where: { id: vehicleId } });
  }

  async updateVehicle(
    userId: string,
    vehicleId: string,
    dto: Partial<CreateVehicleDto>,
  ) {
    const { expiryDate, ...vehicleData } = dto;

    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...vehicleData,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      },
    });

    return {
      ...vehicle,
      ratePerKm: vehicle.ratePerKm ? Number(vehicle.ratePerKm) : null
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  FARMER-FACING VEHICLE BROWSE (Privacy-safe)
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

    // Find recent rejections for this farmer
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
      // Use pg_trgm similarity() for fuzzy matching
      conditions.push(`(
        similarity(v."model", $${paramIndex}) > 0.3 OR 
        v."model" ILIKE $${paramIndex + 1} OR 
        similarity(v."type", $${paramIndex}) > 0.3 OR 
        v."type" ILIKE $${paramIndex + 1} OR 
        similarity(t."businessName", $${paramIndex}) > 0.3 OR
        t."businessName" ILIKE $${paramIndex + 1}
      )`);
      params.push(filters.searchQuery);
      params.push(`%${filters.searchQuery}%`);
      paramIndex += 2;
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
             (SELECT COUNT(*) FROM "TransportRequest" WHERE "vehicleId" = v.id AND status = 'COMPLETED') as "tripCount"
      FROM "Vehicle" v
      JOIN "TransporterProfile" t ON v."transporterId" = t.id
      JOIN "User" u ON t."userId" = u.id
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

    try {
      const rawVehicles = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
      const countResult = await this.prisma.$queryRawUnsafe<any[]>(countSql, ...countParams);

      const total = Number(countResult[0]?.total || 0);

      const mapped = rawVehicles.map((v) => ({
        id: v.id,
        transporterId: v.transporterId,
        type: v.type,
        model: v.model,
        registrationNumber: v.registrationNumber,
        capacity: v.capacity,
        ratePerKm: v.ratePerKm ? Number(v.ratePerKm) : null,
        operatingArea: v.operatingArea,
        rating: v.rating,
        tripCount: Number(v.tripCount) || 0,
        expiryDate: v.expiryDate,
        images: v.images,
        availabilityState: 'AVAILABLE',
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
        meta: {
          total,
          page,
          limit,
          hasMore: offset + mapped.length < total
        }
      };
    } catch (e) {
      console.error('--- TRANSPORTER DB ERROR ---', e);
      throw e;
    }
  }

  async findAll(lat?: number, lng?: number, radius = 10) {
    const rawProfiles = await this.prisma.transporterProfile.findMany({
      include: { user: true, vehicles: true },
    });

    // Fix Prisma Decimal serialization crash: explicitly cast to Number
    const profiles = rawProfiles.map(p => ({
      ...p,
      vehicles: p.vehicles.map(v => ({
        ...v,
        ratePerKm: v.ratePerKm ? Number(v.ratePerKm) : null
      }))
    }));

    if (lat != null && lng != null) {
      const haversine = (
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number,
      ) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      return profiles
        .map((p) => {
          const uLat: number | null = (p.user as any)?.locationLat ?? null;
          const uLng: number | null = (p.user as any)?.locationLng ?? null;
          const distanceKm =
            uLat != null && uLng != null
              ? haversine(lat, lng, uLat, uLng)
              : null;
          return { ...p, distanceKm };
        })
        .filter((p) => p.distanceKm == null || p.distanceKm <= radius)
        .sort((a, b) => {
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;
        });
    }

    return profiles;
  }

  // ─────────────────────────────────────────────────────────────
  //  VEHICLE AVAILABILITY CALENDAR
  // ─────────────────────────────────────────────────────────────

  async getVehicleAvailability(vehicleId: string, month?: string) {
    const where: any = { vehicleId };
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.date = { gte: start, lt: end };
    }
    return this.prisma.vehicleAvailability.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async setVehicleAvailability(
    userId: string,
    vehicleId: string,
    dto: SetAvailabilityDto,
  ) {
    // Verify vehicle belongs to transporter
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Transporter profile not found');

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, transporterId: profile.id },
    });
    if (!vehicle)
      throw new ForbiddenException('Vehicle not found or not yours');

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    return this.prisma.vehicleAvailability.upsert({
      where: { vehicleId_date: { vehicleId, date } },
      create: { vehicleId, date, state: dto.state as any, note: dto.note },
      update: { state: dto.state as any, note: dto.note },
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  TRANSPORT REQUEST (new farmer → transporter flow)
  // ─────────────────────────────────────────────────────────────

  async createTransportRequest(
    farmerId: string,
    dto: CreateTransportRequestDto,
  ) {
    const farmer = await this.prisma.user.findUnique({
      where: { id: farmerId },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.vehicleId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const now = new Date();

    // Check subscription is active
    if (!vehicle.expiryDate || vehicle.expiryDate <= now) {
      throw new BadRequestException(
        'This vehicle does not have an active subscription',
      );
    }

    // Check 24-hour rejection cooldown
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentRejection = await this.prisma.transportRequest.findFirst({
      where: {
        farmerId,
        vehicleId: dto.vehicleId,
        status: 'REJECTED',
        rejectedAt: { gte: oneDayAgo },
      },
      orderBy: { rejectedAt: 'desc' },
    });

    if (recentRejection) {
      const hoursRemaining = Math.ceil(
        24 -
        (now.getTime() - recentRejection.rejectedAt!.getTime()) /
        (1000 * 60 * 60),
      );
      throw new BadRequestException(
        `This vehicle declined your previous request. Please wait ${hoursRemaining} more hour(s) before requesting again.`,
      );
    }

    // Check date availability
    const requiredDate = new Date(dto.requiredDate);
    requiredDate.setHours(0, 0, 0, 0);

    const dayAvail = await this.prisma.vehicleAvailability.findUnique({
      where: {
        vehicleId_date: { vehicleId: dto.vehicleId, date: requiredDate },
      },
    });

    if (
      dayAvail?.state === 'MAINTENANCE' ||
      dayAvail?.state === 'DRIVER_UNAVAILABLE'
    ) {
      throw new BadRequestException(
        'This vehicle is not available on the requested date',
      );
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
      },
      include: { farmer: true },
    });

    const transporterUser = await this.prisma.transporterProfile.findUnique({
      where: { id: dto.transporterId },
      select: { userId: true },
    });

    if (transporterUser) {
      this.notifications.createNotification({
        userId: transporterUser.userId,
        title: 'New Transport Request',
        message: `${newReq.farmer.name || 'A farmer'} requested transport for ${newReq.requiredDate.toLocaleDateString()}`,
        type: 'INFO',
        link: '/(transporter)/(tabs)'
      });
    }

    return newReq;
  }

  async getTransporterRequests(userId: string) {
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
    });
    if (!profile) return [];

    const requests = await this.prisma.transportRequest.findMany({
      where: { transporterId: profile.id },
      include: {
        farmer: { select: { id: true, name: true, phoneNumber: true } }, // Hidden before accept
        vehicle: {
          select: { id: true, type: true, model: true, numberPlate: true },
        },
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

    const whereClause: any = { farmerId };

    if (statuses && statuses.length > 0) {
      const validStatuses = ['SENT', 'ACCEPTED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'];
      const filteredStatuses = statuses
        .map(s => s.toUpperCase())
        .filter(s => validStatuses.includes(s));

      if (filteredStatuses.length > 0) {
        whereClause.status = { in: filteredStatuses };
      }
    }

    const requests = await this.prisma.transportRequest.findMany({
      where: whereClause,
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
        cancelledById: true,
        createdAt: true,
        updatedAt: true,
        vehicle: {
          select: {
            type: true,
            model: true,
            numberPlate: true,
            transporter: {
              select: {
                id: true, // transporterId
                user: {
                  select: {
                    name: true,
                    phoneNumber: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return requests.map((req) => {
      const showTransporterPhone = ['SCHEDULED', 'ACCEPTED', 'COMPLETED'].includes(
        req.status,
      );
      return {
        ...req,
        transporter: {
          name: req.vehicle.transporter.user.name,
          phoneNumber: showTransporterPhone
            ? req.vehicle.transporter.user.phoneNumber
            : null,
        },
      };
    });
  }

  async respondToRequest(
    userId: string,
    requestId: string,
    dto: RespondRequestDto,
  ) {
    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Transporter profile not found');

    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.transporterId !== profile.id)
      throw new ForbiddenException('Not authorized');
    if (request.status !== 'SENT')
      throw new BadRequestException('Request is no longer pending');

    if (dto.action === 'accept') {
      // Auto-block the date on the vehicle availability calendar
      const date = new Date(request.requiredDate);
      date.setHours(0, 0, 0, 0);
      await this.prisma.vehicleAvailability.upsert({
        where: { vehicleId_date: { vehicleId: request.vehicleId, date } },
        create: {
          vehicleId: request.vehicleId,
          date,
          state: 'BUSY',
          note: `Booked - Request ${requestId}`,
        },
        update: { state: 'BUSY', note: `Booked - Request ${requestId}` },
      });

      this.notifications.createNotification({
        userId: request.farmerId,
        title: 'Transport Request Accepted',
        message: `Your transport request has been accepted.`,
        type: 'SUCCESS',
        link: '/(farmer)/transport/my-requests'
      });

      return this.prisma.transportRequest.update({
        where: { id: requestId },
        data: { status: 'SCHEDULED' },
      });
    }

    if (dto.action === 'reject') {
      this.notifications.createNotification({
        userId: request.farmerId,
        title: 'Transport Request Rejected',
        message: `Your transport request was rejected.`,
        type: 'ERROR',
        link: '/(farmer)/transport/my-requests'
      });

      return this.prisma.transportRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', rejectedAt: new Date() },
      });
    }

    if (dto.action === 'suggest') {
      if (!dto.suggestedDate)
        throw new BadRequestException(
          'suggestedDate is required for suggest action',
        );

      this.notifications.createNotification({
        userId: request.farmerId,
        title: 'Alternate Date Suggested',
        message: `The transporter suggested ${new Date(dto.suggestedDate).toLocaleDateString()} instead. Tap to review.`,
        type: 'INFO',
        link: '/(farmer)/transport/my-requests'
      });

      return this.prisma.transportRequest.update({
        where: { id: requestId },
        data: { status: 'SENT', suggestedDate: new Date(dto.suggestedDate) },
      });
    }

    throw new BadRequestException('Invalid action');
  }

  async markRequestComplete(userId: string, requestId: string) {
    // Either farmer or transporter can mark complete
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
      include: { vehicle: { select: { transporterId: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');

    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
    });

    // Authorization check
    const isFarmer = request.farmerId === userId;
    const isTransporter = profile && request.transporterId === profile.id;

    if (!isFarmer && !isTransporter) {
      throw new ForbiddenException(
        'You are not authorized to complete this request',
      );
    }
    if (!['SCHEDULED', 'ACCEPTED'].includes(request.status)) {
      throw new BadRequestException(
        'Request must be scheduled/accepted to mark complete',
      );
    }

    // Free the vehicle calendar for that date
    const date = new Date(request.requiredDate);
    date.setHours(0, 0, 0, 0);
    await this.prisma.vehicleAvailability.upsert({
      where: { vehicleId_date: { vehicleId: request.vehicleId, date } },
      create: { vehicleId: request.vehicleId, date, state: 'AVAILABLE' },
      update: { state: 'AVAILABLE', note: 'Trip completed' },
    });

    // Increment vehicle tripCount
    await this.prisma.vehicle.update({
      where: { id: request.vehicleId },
      data: { tripCount: { increment: 1 } },
    });

    return this.prisma.transportRequest.update({
      where: { id: requestId },
      data: { status: 'COMPLETED' },
    });
  }

  async cancelTransportRequest(
    userId: string,
    requestId: string,
    dto: { reason: string },
  ) {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');

    const profile = await this.prisma.transporterProfile.findUnique({
      where: { userId },
    });

    const isFarmer = request.farmerId === userId;
    const isTransporter = profile && request.transporterId === profile.id;

    if (!isFarmer && !isTransporter) {
      throw new ForbiddenException(
        'You are not authorized to cancel this request',
      );
    }

    // Free the calendar if it was scheduled
    if (request.status === 'SCHEDULED') {
      const date = new Date(request.requiredDate);
      date.setHours(0, 0, 0, 0);
      await this.prisma.vehicleAvailability.upsert({
        where: { vehicleId_date: { vehicleId: request.vehicleId, date } },
        create: { vehicleId: request.vehicleId, date, state: 'AVAILABLE' },
        update: { state: 'AVAILABLE', note: 'Trip cancelled' },
      });
    }

    const updated = await this.prisma.transportRequest.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
        cancellationReason: dto.reason,
        cancelledById: userId,
      },
    });

    let notifyTargetUserId = request.farmerId;
    if (isFarmer) {
      const transporter = await this.prisma.transporterProfile.findUnique({
        where: { id: updated.transporterId },
      });
      if (transporter) notifyTargetUserId = transporter.userId;
    }

    const cancelerName = isFarmer ? 'Farmer' : 'Transporter';

    this.notifications.createNotification({
      userId: notifyTargetUserId,
      title: 'Trip Cancelled',
      message: `${cancelerName} cancelled the trip. Reason: ${dto.reason}`,
      type: 'WARNING',
    });

    return updated;
  }

  async confirmSuggestion(
    userId: string,
    requestId: string,
    dto: { accept: boolean },
  ) {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');

    if (request.farmerId !== userId) {
      throw new ForbiddenException(
        'Only the farmer can confirm a suggested date',
      );
    }
    if (request.status !== 'SENT' || !request.suggestedDate) {
      throw new BadRequestException('No pending suggestion found for this request');
    }

    if (dto.accept) {
      // Create or update vehicle availability for the new date
      const date = new Date(request.suggestedDate);
      date.setHours(0, 0, 0, 0);
      await this.prisma.vehicleAvailability.upsert({
        where: { vehicleId_date: { vehicleId: request.vehicleId, date } },
        create: {
          vehicleId: request.vehicleId,
          date,
          state: 'BUSY',
          note: `Booked (Suggested) - Request ${requestId}`,
        },
        update: { state: 'BUSY', note: `Booked (Suggested) - Request ${requestId}` },
      });

      const updated = await this.prisma.transportRequest.update({
        where: { id: requestId },
        data: {
          status: 'SCHEDULED',
          requiredDate: request.suggestedDate, // Update the actual required date to the accepted suggestion
        },
      });

      const transporter = await this.prisma.transporterProfile.findUnique({
        where: { id: updated.transporterId },
      });

      if (transporter) {
        this.notifications.createNotification({
          userId: transporter.userId,
          title: 'Suggestion Accepted',
          message: `Farmer accepted the suggested alternate date.`,
          type: 'SUCCESS',
        });
      }

      return updated;
    } else {
      const updated = await this.prisma.transportRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'Farmer rejected the suggested alternate date',
          cancelledById: userId,
        },
      });

      const transporter = await this.prisma.transporterProfile.findUnique({
        where: { id: updated.transporterId },
      });

      if (transporter) {
        this.notifications.createNotification({
          userId: transporter.userId,
          title: 'Suggestion Declined',
          message: `Farmer declined your suggested alternate date. The trip is cancelled.`,
          type: 'WARNING',
        });
      }

      return updated;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  LEGACY - Book Trip (kept for backward compat)
  // ─────────────────────────────────────────────────────────────

  async bookTrip(farmerId: string, dto: CreateTripDto) {
    const farmer = await this.prisma.user.findUnique({
      where: { id: farmerId },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');

    const transporter = await this.prisma.transporterProfile.findUnique({
      where: { id: dto.transporterId },
    });
    if (!transporter) throw new NotFoundException('Transporter not found');

    // 24-hour cooldown check
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const recentRejectedRequest = await this.prisma.transportTrip.findFirst({
      where: {
        farmerId,
        transporterId: dto.transporterId,
        status: 'rejected',
        updatedAt: { gte: oneDayAgo },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (recentRejectedRequest) {
      const hoursRemaining = Math.ceil(
        24 -
        (Date.now() - recentRejectedRequest.updatedAt.getTime()) /
        (1000 * 60 * 60),
      );
      throw new BadRequestException(
        `This transporter declined your previous request. Please wait ${hoursRemaining} more hour(s) before requesting again.`,
      );
    }

    return this.prisma.transportTrip.create({
      data: {
        transporterId: dto.transporterId,
        farmerId,
        farmerName: farmer.name || 'Unknown Farmer',
        farmerPhone: farmer.phoneNumber,
        pickupLocation: dto.pickupLocation,
        dropLocation: dto.dropLocation,
        loadType: dto.loadType,
        vehicleType: dto.vehicleType,
        date: new Date(dto.date),
        status: 'pending',
      },
    });
  }

  async getFarmerTrips(farmerId: string) {
    return this.prisma.transportTrip.findMany({
      where: { farmerId },
      include: { transporter: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
