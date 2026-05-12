import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { NurseryProductCategory } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { CreateNurseryProfileDto } from './dto/nursery-profile.dto';
import {
  CreateNurseryProductDto,
  UpdateNurseryProductDto,
  CreateNurseryEnquiryDto,
} from './dto/nursery-product.dto';

@Injectable()
export class NurseryService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // --- SEASONAL LOGIC ---
  private getSeasonByMonth(month: number): string {
    if (month >= 6 && month <= 9) return 'Monsoon';
    if (month >= 3 && month <= 5) return 'Summer';
    return 'Winter';
  }

  private readonly SEASONAL_CATEGORIES: Record<string, NurseryProductCategory[]> = {
    Monsoon: [NurseryProductCategory.VEGETABLE_SEEDLING, NurseryProductCategory.SEEDS],
    Summer: [NurseryProductCategory.FRUIT_PLANT, NurseryProductCategory.FARMING_TOOLS],
    Winter: [NurseryProductCategory.VEGETABLE_SEEDLING, NurseryProductCategory.ORGANIC_FERTILIZER],
  };

  // --- NURSERY PROFILE ---

  async getProfile(userId: string) {
    const profile = await this.prisma.nurseryProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            profileImage: true,
            locationLat: true,
            locationLng: true,
            isVerified: true,
          },
        },
        products: {
          where: { isAvailable: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { products: true, enquiries: true } },
      },
    });

    if (!profile) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      return { user, profile: null };
    }

    return profile;
  }

  async upsertProfile(userId: string, dto: CreateNurseryProfileDto) {
    const { locationLat, locationLng, nurseryName, ...profileData } = dto;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: nurseryName,
        role: 'NURSERY',
        locationLat: locationLat ?? undefined,
        locationLng: locationLng ?? undefined,
      },
    });

    const result = await this.prisma.nurseryProfile.upsert({
      where: { userId },
      create: {
        ...profileData,
        nurseryName,
        userId,
        lat: locationLat,
        lng: locationLng,
      },
      update: {
        ...profileData,
        nurseryName,
        lat: locationLat ?? undefined,
        lng: locationLng ?? undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            profileImage: true,
            locationLat: true,
            locationLng: true,
            isVerified: true,
          },
        },
      },
    });

    return result;
  }

  // --- PRODUCTS ---

  async addProduct(userId: string, dto: CreateNurseryProductDto) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Nursery profile not found. Please complete registration first.');

    return this.prisma.nurseryProduct.create({
      data: {
        ...dto,
        nurseryId: profile.id,
      },
    });
  }

  async getMyProducts(
    userId: string,
    page = 1,
    limit = 20,
    category?: NurseryProductCategory,
  ) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], total: 0, page, totalPages: 0 };

    const skip = (page - 1) * limit;
    const where = {
      nurseryId: profile.id,
      ...(category ? { category } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.nurseryProduct.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.nurseryProduct.count({ where }),
    ]);

    return {
      data: data.map((p) => ({ ...p, price: Number(p.price) })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getProductById(id: string) {
    const product = await this.prisma.nurseryProduct.findUnique({
      where: { id },
      include: {
        nursery: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                profileImage: true,
                locationLat: true,
                locationLng: true,
              },
            },
          },
        },
      },
    });

    if (!product) throw new NotFoundException('Product not found');
    return { ...product, price: Number(product.price) };
  }

  async updateProduct(userId: string, productId: string, dto: UpdateNurseryProductDto) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Nursery profile not found');

    const product = await this.prisma.nurseryProduct.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.nurseryId !== profile.id) throw new ForbiddenException('Not your product');

    return this.prisma.nurseryProduct.update({
      where: { id: productId },
      data: dto,
    });
  }

  async deleteProduct(userId: string, productId: string) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Nursery profile not found');

    const product = await this.prisma.nurseryProduct.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.nurseryId !== profile.id) throw new ForbiddenException('Not your product');

    await this.prisma.nurseryProduct.delete({ where: { id: productId } });
    return { success: true };
  }

  async toggleProductAvailability(userId: string, productId: string) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Nursery profile not found');

    const product = await this.prisma.nurseryProduct.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.nurseryId !== profile.id) throw new ForbiddenException('Not your product');

    return this.prisma.nurseryProduct.update({
      where: { id: productId },
      data: { isAvailable: !product.isAvailable },
    });
  }

  // --- FARMER-SIDE: DISCOVERY ---

  async findAll(filters: {
    lat?: number;
    lng?: number;
    radius?: number;
    page?: number;
    limit?: number;
    searchQuery?: string;
    category?: NurseryProductCategory;
    deliveryOnly?: boolean;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = ['np."isActive" = true', 'u."isVerified" = true'];

    if (filters.deliveryOnly) {
      conditions.push(`np."deliveryAvailable" = true`);
    }

    if (filters.searchQuery) {
      conditions.push(`(
        np."nurseryName" ILIKE $${paramIndex} OR
        np."description" ILIKE $${paramIndex} OR
        np."district" ILIKE $${paramIndex} OR
        np."village" ILIKE $${paramIndex} OR
        u."name" ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.searchQuery}%`);
      paramIndex += 1;
    }

    let distanceSelect = 'NULL::float as "distanceKm"';
    let distanceOrder = 'ORDER BY np."rating" DESC, np."totalSales" DESC';

    if (filters.lat != null && filters.lng != null) {
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
      SELECT np.*,
             u.id as "user_id", u.name as "user_name", u."phoneNumber" as "user_phone",
             u."locationLat" as "user_lat", u."locationLng" as "user_lng",
             u."profileImage" as "user_photo",
             (SELECT COUNT(*) FROM "NurseryProduct" p WHERE p."nurseryId" = np.id AND p."isAvailable" = true) as "productCount",
             ${distanceSelect}
      FROM "NurseryProfile" np
      JOIN "User" u ON np."userId" = u.id
      ${whereClause}
      ${distanceOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM "NurseryProfile" np
      JOIN "User" u ON np."userId" = u.id
      ${whereClause}
    `;

    const countParams = [...params];
    params.push(limit, offset);

    const rawNurseries = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const countResult = await this.prisma.$queryRawUnsafe<any[]>(countSql, ...countParams);

    const total = Number(countResult[0]?.total || 0);

    const mapped = rawNurseries.map((n) => ({
      id: n.id,
      nurseryName: n.nurseryName,
      description: n.description,
      specializations: n.specializations,
      district: n.district,
      village: n.village,
      deliveryAvailable: n.deliveryAvailable,
      whatsappNumber: n.whatsappNumber,
      businessPhotos: n.businessPhotos,
      rating: n.rating,
      totalSales: n.totalSales,
      productCount: Number(n.productCount),
      distanceKm: n.distanceKm ?? null,
      user: {
        id: n.user_id,
        name: n.user_name,
        phoneNumber: n.user_phone,
        locationLat: n.user_lat,
        locationLng: n.user_lng,
        profileImage: n.user_photo,
      },
    }));

    return {
      data: mapped,
      meta: { total, page, limit, hasMore: offset + mapped.length < total },
    };
  }

  async findProducts(filters: {
    lat?: number;
    lng?: number;
    radius?: number;
    page?: number;
    limit?: number;
    searchQuery?: string;
    category?: NurseryProductCategory;
    maxPrice?: number;
    season?: string;
    deliveryOnly?: boolean;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = [
      'p."isAvailable" = true',
      'np."isActive" = true',
      'u."isVerified" = true',
    ];

    if (filters.category) {
      conditions.push(`p."category" = $${paramIndex++}::"NurseryProductCategory"`);
      params.push(filters.category);
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(`p."price" <= $${paramIndex++}`);
      params.push(filters.maxPrice);
    }

    if (filters.season) {
      conditions.push(`(p."season" = $${paramIndex} OR p."season" = 'All Year')`);
      params.push(filters.season);
      paramIndex += 1;
    }

    if (filters.deliveryOnly) {
      conditions.push(`p."deliveryAvailable" = true`);
    }

    if (filters.searchQuery) {
      conditions.push(`(
        p."name" ILIKE $${paramIndex} OR
        p."description" ILIKE $${paramIndex} OR
        np."nurseryName" ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.searchQuery}%`);
      paramIndex += 1;
    }

    let distanceSelect = 'NULL::float as "distanceKm"';
    let distanceOrder = 'ORDER BY p."createdAt" DESC';

    if (filters.lat != null && filters.lng != null) {
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
      distanceOrder = 'ORDER BY "distanceKm" ASC NULLS LAST, p."createdAt" DESC';
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT p.*,
             np.id as "nursery_id", np."nurseryName" as "nursery_name",
             np."deliveryAvailable" as "nursery_delivery",
             np."whatsappNumber" as "nursery_whatsapp",
             np.rating as "nursery_rating",
             u.id as "user_id", u."phoneNumber" as "user_phone",
             u."locationLat" as "user_lat", u."locationLng" as "user_lng",
             ${distanceSelect}
      FROM "NurseryProduct" p
      JOIN "NurseryProfile" np ON p."nurseryId" = np.id
      JOIN "User" u ON np."userId" = u.id
      ${whereClause}
      ${distanceOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM "NurseryProduct" p
      JOIN "NurseryProfile" np ON p."nurseryId" = np.id
      JOIN "User" u ON np."userId" = u.id
      ${whereClause}
    `;

    const countParams = [...params];
    params.push(limit, offset);

    const rawProducts = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const countResult = await this.prisma.$queryRawUnsafe<any[]>(countSql, ...countParams);

    const total = Number(countResult[0]?.total || 0);

    const mapped = rawProducts.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: Number(p.price),
      quantity: p.quantity,
      unit: p.unit,
      description: p.description,
      images: p.images,
      deliveryAvailable: p.deliveryAvailable,
      whatsappNumber: p.whatsappNumber,
      season: p.season,
      distanceKm: p.distanceKm ?? null,
      nursery: {
        id: p.nursery_id,
        nurseryName: p.nursery_name,
        deliveryAvailable: p.nursery_delivery,
        whatsappNumber: p.nursery_whatsapp,
        rating: p.nursery_rating,
        user: {
          id: p.user_id,
          phoneNumber: p.user_phone,
          locationLat: p.user_lat,
          locationLng: p.user_lng,
        },
      },
    }));

    return {
      data: mapped,
      meta: { total, page, limit, hasMore: offset + mapped.length < total },
    };
  }

  async getNurseryById(id: string) {
    const nursery = await this.prisma.nurseryProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            profileImage: true,
            locationLat: true,
            locationLng: true,
            isVerified: true,
          },
        },
        products: {
          where: { isAvailable: true },
          orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
        },
        _count: { select: { products: true, enquiries: true } },
      },
    });

    if (!nursery) throw new NotFoundException('Nursery not found');

    return {
      ...nursery,
      products: nursery.products.map((p) => ({ ...p, price: Number(p.price) })),
    };
  }

  async getSeasonalSuggestions(lat?: number, lng?: number) {
    const currentMonth = new Date().getMonth() + 1;
    const season = this.getSeasonByMonth(currentMonth);
    const categories = this.SEASONAL_CATEGORIES[season] || [];

    return this.findProducts({
      lat,
      lng,
      radius: 100,
      season,
      page: 1,
      limit: 20,
    });
  }

  // --- ENQUIRIES ---

  async createEnquiry(farmerId: string, dto: CreateNurseryEnquiryDto) {
    const nursery = await this.prisma.nurseryProfile.findUnique({
      where: { id: dto.nurseryId },
      include: { user: true },
    });
    if (!nursery) throw new NotFoundException('Nursery not found');

    if (dto.productId) {
      const product = await this.prisma.nurseryProduct.findUnique({
        where: { id: dto.productId },
      });
      if (!product || product.nurseryId !== nursery.id) {
        throw new BadRequestException('Product does not belong to this nursery');
      }
    }

    const enquiry = await this.prisma.nurseryEnquiry.create({
      data: {
        farmerId,
        nurseryId: dto.nurseryId,
        productId: dto.productId,
        message: dto.message,
        quantity: dto.quantity,
      },
      include: {
        farmer: { select: { name: true, phoneNumber: true } },
        product: { select: { name: true, category: true } },
      },
    });

    const productLabel = enquiry.product ? `for ${enquiry.product.name}` : '';
    this.notifications.createNotification({
      userId: nursery.user.id,
      title: 'New Product Enquiry',
      message: `${enquiry.farmer.name || 'A farmer'} sent an enquiry ${productLabel}`,
      type: 'INFO',
      link: '/(nursery)/enquiries',
    });

    return enquiry;
  }

  async getMyEnquiries(userId: string, page = 1, limit = 20) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) return { data: [], total: 0, page, totalPages: 0 };

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.nurseryEnquiry.findMany({
        where: { nurseryId: profile.id },
        include: {
          farmer: { select: { name: true, phoneNumber: true, profileImage: true } },
          product: { select: { name: true, category: true, price: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.nurseryEnquiry.count({ where: { nurseryId: profile.id } }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async respondToEnquiry(userId: string, enquiryId: string, message: string) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Nursery profile not found');

    const enquiry = await this.prisma.nurseryEnquiry.findUnique({
      where: { id: enquiryId },
      include: { farmer: { select: { id: true, name: true } } },
    });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (enquiry.nurseryId !== profile.id) throw new ForbiddenException('Not your enquiry');

    const updated = await this.prisma.nurseryEnquiry.update({
      where: { id: enquiryId },
      data: { status: 'responded' },
    });

    this.notifications.createNotification({
      userId: enquiry.farmer.id,
      title: 'Nursery Responded',
      message: `${profile.nurseryName} replied to your enquiry: "${message}"`,
      type: 'SUCCESS',
      link: '/(farmer)/nursery/enquiries',
    });

    return { ...updated, responseMessage: message };
  }

  async closeEnquiry(userId: string, enquiryId: string) {
    const profile = await this.prisma.nurseryProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Nursery profile not found');

    const enquiry = await this.prisma.nurseryEnquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry || enquiry.nurseryId !== profile.id) throw new NotFoundException('Enquiry not found');

    return this.prisma.nurseryEnquiry.update({
      where: { id: enquiryId },
      data: { status: 'closed' },
    });
  }
}
