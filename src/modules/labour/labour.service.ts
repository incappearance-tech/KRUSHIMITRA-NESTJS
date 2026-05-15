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
import { haversineKm, postgisDistanceKmSql, postgisWithinSql } from '../../common/utils/haversine.util';
import { RedisService } from '../../database/redis/redis.service';

@Injectable()
export class LabourService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private redis: RedisService,
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

  // haversineKm imported from shared utility — no local copy needed

  async getLeads(userId: string, page: number = 1, limit: number = 20) {
    const profile = await this.prisma.labourProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], total: 0, page, totalPages: 0 };

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.prisma.labourBooking.findMany({
        where: { labourId: profile.id, status: 'pending' },
        include: {
          farmer: { select: { name: true, phoneNumber: true, locationLat: true, locationLng: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.labourBooking.count({ where: { labourId: profile.id, status: 'pending' } }),
    ]);

    // Compute distance server-side — labourer sees how far the farm is
    // LabourProfile uses lat/lng (User model uses locationLat/locationLng)
    const labLat = profile.lat ?? null;
    const labLng = profile.lng ?? null;

    const data = bookings.map(b => ({
      ...b,
      distanceKm:
        labLat != null && labLng != null &&
        b.farmer?.locationLat != null && b.farmer?.locationLng != null
          ? Math.round(haversineKm(labLat, labLng, b.farmer.locationLat!, b.farmer.locationLng!) * 10) / 10
          : null,
    }));

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getJobHistory(userId: string, page: number = 1, limit: number = 20) {
    const profile = await this.prisma.labourProfile.findUnique({
      where: { userId },
    });
    if (!profile) return { data: [], total: 0, page, totalPages: 0 };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.labourBooking.findMany({
        where: { labourId: profile.id, status: { in: ['completed', 'rejected'] } },
        include: { farmer: { select: { name: true, phoneNumber: true, locationLat: true, locationLng: true } } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.labourBooking.count({
        where: { labourId: profile.id, status: { in: ['completed', 'rejected'] } },
      }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getActiveJobs(userId: string, page: number = 1, limit: number = 20) {
    const profile = await this.prisma.labourProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], total: 0, page, totalPages: 0 };

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.labourBooking.findMany({
        where: { labourId: profile.id, status: 'accepted' },
        include: { farmer: { select: { name: true, phoneNumber: true, locationLat: true, locationLng: true } } },
        orderBy: { date: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.labourBooking.count({
        where: { labourId: profile.id, status: 'accepted' },
      }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async cancelBooking(userId: string, bookingId: string) {
    const booking = await this.prisma.labourBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const profile = await this.prisma.labourProfile.findUnique({ where: { userId } });
    if (!profile || booking.labourId !== profile.id) {
      throw new NotFoundException('You are not authorized to cancel this booking.');
    }
    if (booking.status !== 'accepted') {
      throw new BadRequestException('Only accepted bookings can be cancelled.');
    }

    const updated = await this.prisma.labourBooking.update({
      where: { id: bookingId },
      data: { status: 'rejected' },
      include: { farmer: { select: { name: true, phoneNumber: true } } },
    });

    this.notifications.createNotification({
      userId: booking.farmerId,
      title: 'Booking Cancelled',
      message: `The labourer has cancelled their booking for ${updated.taskType}. Please find another worker.`,
      type: 'ERROR',
      link: '/(farmer)/labour/my-requests'
    });

    return updated;
  }

  async cancelFarmerBooking(userId: string, bookingId: string) {
    const booking = await this.prisma.labourBooking.findUnique({
      where: { id: bookingId },
      include: { labour: { include: { user: true } } }
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.farmerId !== userId) {
      throw new BadRequestException('You are not authorized to cancel this booking.');
    }

    if (booking.status === 'completed' || booking.status === 'rejected') {
      throw new BadRequestException('Cannot cancel a completed or already rejected booking.');
    }

    const updated = await this.prisma.labourBooking.update({
      where: { id: bookingId },
      data: { status: 'rejected' }, // Using rejected as the final state for cancelled/rejected
    });

    // Notify the labourer
    this.notifications.createNotification({
      userId: booking.labour.userId,
      title: 'Booking Cancelled by Farmer',
      message: `The farmer has cancelled their request for ${booking.taskType} on ${booking.date.toLocaleDateString()}.`,
      type: 'WARNING',
      link: '/(labour)/job-history'
    });

    return updated;
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
    } else if (status === 'completed') {
      await this.prisma.labourProfile.update({
        where: { id: booking.labourId },
        data: {
          jobsCompleted: { increment: 1 }
        }
      });
      this.notifications.createNotification({
        userId: booking.farmerId,
        title: 'Job Completed',
        message: `Your labour booking for ${updated.taskType} has been marked as completed.`,
        type: 'SUCCESS',
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
      name,
      locationLat,
      locationLng,
      ...profileData
    } = dto;

    // Update user (location, name, and role)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        locationLat: locationLat !== undefined ? locationLat : undefined,
        locationLng: locationLng !== undefined ? locationLng : undefined,
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

    // Cache key: stable hash of all filter params (30s TTL — fresh enough for browse)
    const cacheKey = `labour:browse:${JSON.stringify({ ...filters, page, limit })}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached as string);

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = ['u."isVerified" = true'];

    const hasCoords = filters.lat != null && filters.lng != null;

    // Legacy location filters (pincode, district, taluka) are removed because they were deprecated in favor of GPS-only model

    if (filters.skills && filters.skills.length > 0) {
      // Use the && operator for text[] array overlap check
      conditions.push(`p."skills" && $${paramIndex++}::text[]`);
      params.push(filters.skills);
    }

    if (filters.searchQuery) {
      // Use ILIKE for search as pg_trgm similarity() might not be enabled
      conditions.push(`(
        p."experience" ILIKE $${paramIndex} OR 
        u."name" ILIKE $${paramIndex} OR
        u."phoneNumber" ILIKE $${paramIndex} OR
        EXISTS (SELECT 1 FROM unnest(p."skills") s WHERE s ILIKE $${paramIndex})
      )`);
      params.push(`%${filters.searchQuery}%`);
      paramIndex += 1;
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
      // PostGIS: ST_Distance(geography) in km; ST_DWithin for radius filter
      const distCalc = postgisDistanceKmSql(
        'u."locationLng"', 'u."locationLat"',
        `$${paramIndex}`, `$${paramIndex + 1}`,
      );
      const withinExpr = postgisWithinSql(
        'u."locationLng"', 'u."locationLat"',
        `$${paramIndex}`, `$${paramIndex + 1}`,
        `$${paramIndex + 2}`,
      );
      params.push(filters.lng, filters.lat, filters.radius ?? 50);
      paramIndex += 3;

      distanceSelect = `${distCalc} as "distanceKm"`;
      conditions.push(`u."locationLat" IS NOT NULL AND u."locationLng" IS NOT NULL`);
      conditions.push(withinExpr);
      distanceOrder = 'ORDER BY "distanceKm" ASC NULLS LAST';
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // COUNT(*) OVER() window function eliminates the separate count query (1 DB round-trip saved)
    const sql = `
      SELECT p.*,
             u.id as "user_id", u.name as "user_name", u."phoneNumber" as "user_phone",
             u."locationLat" as "user_lat", u."locationLng" as "user_lng",
             ${distanceSelect},
             COUNT(*) OVER() AS "totalCount"
      FROM "LabourProfile" p
      JOIN "User" u ON p."userId" = u.id
      ${whereClause}
      ${distanceOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const rawProfiles = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);

    const total = rawProfiles.length > 0 ? Number(rawProfiles[0].totalCount) : 0;

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

    const result = {
      data: mapped,
      meta: {
        total,
        page,
        limit,
        hasMore: offset + mapped.length < total,
      },
    };

    // Cache for 30 seconds — short enough to stay fresh, long enough to absorb traffic bursts
    this.redis.set(cacheKey, JSON.stringify(result), 30).catch(() => { /* non-critical */ });

    return result;
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
