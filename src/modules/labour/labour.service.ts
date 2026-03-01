import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CreateLabourProfileDto,
  UpdateLabourProfileDto,
} from './dto/labour-profile.dto';
import { CreateLabourBookingDto } from './dto/labour-booking.dto';
import { NotificationsService } from '../../common/notifications/notifications.service';

@Injectable()
export class LabourService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService
  ) { }

  private readonly LABOUR_TYPES = [
    'Ploughing (Nangarni)',
    'Harvesting (Katni/Kapni)',
    'Transplanting (Ropani)',
    'Weeding (Nindai/Khurpi)',
    'Spraying (Fawarani)',
    'Cotton Picking',
    'Sugarcane Cutting',
    'Threshing',
    'General Labour',
    'Loading/Unloading (Hamali)',
    'Dairy Farming',
    'Fencing',
    'Other',
  ];

  getTypes() {
    return this.LABOUR_TYPES;
  }

  async getLeads(userId: string, page: number = 1, limit: number = 20) {
    // Find labourer's profile
    const profile = await this.prisma.labourProfile.findUnique({
      where: { userId },
    });
    if (!profile) return { data: [], total: 0, page, totalPages: 0 };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.labourBooking.findMany({
        where: { labourId: profile.id, status: { in: ['pending', 'accepted', 'completed'] } },
        include: { farmer: { select: { name: true, phoneNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.labourBooking.count({
        where: { labourId: profile.id, status: { in: ['pending', 'accepted', 'completed'] } },
      }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createBooking(farmerId: string, dto: CreateLabourBookingDto) {
    // Verify labourer profile exists
    const labour = await this.prisma.labourProfile.findUnique({
      where: { id: dto.labourId },
    });
    if (!labour) throw new NotFoundException('Labourer not found');

    const requestedDate = new Date(dto.date);

    // Check if the farmer is already busy on this date
    const startOfDay = new Date(requestedDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(requestedDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingFarmerBooking = await this.prisma.labourBooking.findFirst({
      where: {
        farmerId,
        status: { in: ['accepted', 'pending'] },
        date: {
          gte: startOfDay,
          lte: endOfDay,
        }
      }
    });

    if (existingFarmerBooking) {
      throw new BadRequestException('You already have a booking for this date. Please select another date.');
    }

    // Check if the LABOURER is already busy on this date
    const existingLabourBooking = await this.prisma.labourBooking.findFirst({
      where: {
        labourId: dto.labourId,
        status: { in: ['accepted', 'pending'] },
        date: {
          gte: startOfDay,
          lte: endOfDay,
        }
      }
    });

    if (existingLabourBooking) {
      throw new BadRequestException('This worker already has a booking or a pending request for this date. Please select another date or worker.');
    }

    const booking = await this.prisma.labourBooking.create({
      data: {
        farmerId,
        labourId: dto.labourId,
        taskType: dto.taskType,
        date: requestedDate,
        numberOfDays: dto.numberOfDays ?? 1,
        location: dto.location,
        workers: dto.workers ?? 1,
        description: dto.description,
        status: 'pending',
      },
      include: {
        labour: { include: { user: true } },
        farmer: true
      },
    });

    this.notifications.createNotification({
      userId: booking.labour.userId,
      title: 'New Labour Booking',
      message: `${booking.farmer.name || 'A farmer'} requested your services for ${booking.taskType} on ${booking.date.toLocaleDateString()}`,
      type: 'INFO',
      link: '/(labour)/incoming-jobs'
    });

    return booking;
  }

  async getMyBookings(farmerId: string) {
    return this.prisma.labourBooking.findMany({
      where: { farmerId },
      include: { labour: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateBookingStatus(userId: string, bookingId: string, status: string) {
    const validStatuses = ['accepted', 'rejected', 'completed'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const booking = await this.prisma.labourBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Only the assigned labourer can accept/reject
    const profile = await this.prisma.labourProfile.findUnique({
      where: { userId },
    });
    if (profile && booking.labourId !== profile.id) {
      throw new NotFoundException(
        'You are not authorized to update this booking.',
      );
    }

    const updated = await this.prisma.labourBooking.update({
      where: { id: bookingId },
      data: { status },
      include: { farmer: { select: { name: true, phoneNumber: true } } },
    });

    if (status === 'accepted') {
      this.notifications.createNotification({
        userId: booking.farmerId,
        title: 'Booking Accepted',
        message: `Your labour booking for ${updated.taskType} was accepted.`,
        type: 'SUCCESS',
        link: '/(farmer)/labour/my-requests'
      });
    } else if (status === 'rejected') {
      this.notifications.createNotification({
        userId: booking.farmerId,
        title: 'Booking Rejected',
        message: `Your labour booking for ${updated.taskType} was rejected.`,
        type: 'ERROR',
        link: '/(farmer)/labour/my-requests'
      });
    }

    return updated;
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.labourProfile.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!profile) {
      // Return user info at least if profile doesn't exist yet
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      return { user, profile: null };
    }

    return {
      ...profile,
      pricePerDay: Number(profile.pricePerDay),
    };
  }

  async upsertProfile(userId: string, dto: CreateLabourProfileDto) {
    const {
      locationAddress,
      state,
      district,
      taluka,
      village,
      pincode,
      name,
      ...profileData
    } = dto;

    // Update user (location, name, and role)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        locationAddress: locationAddress || undefined,
        state: state || undefined,
        district: district || undefined,
        taluka: taluka || undefined,
        village: village || undefined,
        pincode: pincode || undefined,
        name: name || undefined,
        role: 'LABOUR', // Upgrade from GUEST to LABOUR
      },
    });

    const result = await this.prisma.labourProfile.upsert({
      where: { userId },
      create: {
        ...profileData,
        userId,
      },
      update: {
        ...profileData,
      },
      include: { user: true },
    });

    return {
      ...result,
      pricePerDay: Number(result.pricePerDay),
    };
  }

  async findAll(filters: {
    lat?: number;
    lng?: number;
    radius?: number;
    page?: number;
    limit?: number;
    searchQuery?: string;
    skills?: string[];
    minRating?: number;
    maxPrice?: number;
    pincode?: string;
    district?: string;
    taluka?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = ['u."isVerified" = true']; // Added isVerified check for safety

    const hasCoords = filters.lat != null && filters.lng != null;

    if (!hasCoords) {
      if (filters.pincode) {
        conditions.push(`u."pincode" = $${paramIndex++}`);
        params.push(filters.pincode);
      }

      if (filters.district) {
        conditions.push(`u."district" ILIKE $${paramIndex++}`);
        params.push(filters.district);
      }

      if (filters.taluka) {
        conditions.push(`u."taluka" ILIKE $${paramIndex++}`);
        params.push(filters.taluka);
      }
    }

    if (filters.skills && filters.skills.length > 0) {
      // Use the && operator for text[] array overlap check
      conditions.push(`p."skills" && $${paramIndex++}::text[]`);
      params.push(filters.skills);
    }

    if (filters.searchQuery) {
      // Use pg_trgm similarity() for fuzzy matching
      // Added skills search and lowered threshold to 0.2 for broader discovery
      conditions.push(`(
        similarity(p."experience", $${paramIndex}) > 0.2 OR 
        p."experience" ILIKE $${paramIndex + 1} OR 
        similarity(u."name", $${paramIndex}) > 0.2 OR
        u."name" ILIKE $${paramIndex + 1} OR
        u."phoneNumber" ILIKE $${paramIndex + 1} OR
        u."village" ILIKE $${paramIndex + 1} OR
        EXISTS (SELECT 1 FROM unnest(p."skills") s WHERE s ILIKE $${paramIndex + 1})
      )`);
      params.push(filters.searchQuery);
      params.push(`%${filters.searchQuery}%`);
      paramIndex += 2;
    }

    if (filters.minRating !== undefined) {
      conditions.push(`p."rating" >= $${paramIndex++}`);
      params.push(filters.minRating);
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(`p."pricePerDay" <= $${paramIndex++}`);
      params.push(filters.maxPrice);
    }

    let distanceSelect = 'NULL::float as "distanceKm"';
    let distanceOrder = 'ORDER BY p."createdAt" DESC';

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
      SELECT p.*,
             u.id as "user_id", u.name as "user_name", u."phoneNumber" as "user_phone",
             u."locationLat" as "user_lat", u."locationLng" as "user_lng",
             ${distanceSelect}
      FROM "LabourProfile" p
      JOIN "User" u ON p."userId" = u.id
      ${whereClause}
      ${distanceOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM "LabourProfile" p
      JOIN "User" u ON p."userId" = u.id
      ${whereClause}
    `;

    const countParams = [...params];
    params.push(limit, offset);

    const rawProfiles = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const countResult = await this.prisma.$queryRawUnsafe<any[]>(countSql, ...countParams);

    const total = Number(countResult[0]?.total || 0);

    const mapped = rawProfiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      skills: p.skills,
      experience: p.experience,
      pricePerDay: Number(p.pricePerDay),
      isAvailable: p.isAvailable,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      distanceKm: p.distanceKm ?? null,
      user: {
        id: p.user_id,
        name: p.user_name,
        phoneNumber: p.user_phone,
        locationLat: p.user_lat,
        locationLng: p.user_lng,
      }
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
  }
  async findOne(id: string) {
    const profile = await this.prisma.labourProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!profile) throw new NotFoundException('Labourer not found');
    return {
      ...profile,
      pricePerDay: Number(profile.pricePerDay),
    };
  }
}
