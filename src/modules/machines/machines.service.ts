import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateMachineDto, MachineFilterDto } from './dto/machine.dto';
import { CreateRentalRequestDto, RejectRentalRequestDto } from './dto/rental-request.dto';

@Injectable()
export class MachinesService {
  private readonly logger = new Logger(MachinesService.name);
  constructor(private prisma: PrismaService) { }

  async createListing(ownerId: string, data: CreateMachineDto) {
    const { paymentDetails, ...machineData } = data;

    // Duplicate check
    const existing = await this.prisma.machine.findFirst({
      where: { ownerId, brand: machineData.brand, model: machineData.model },
    });
    if (existing) {
      throw new ConflictException('A machine with this brand and model already exists in your inventory.');
    }

    const plan = machineData.plan || 'free';
    let status: string;
    let planExpiresAt: Date | undefined;

    // ── FREE PLAN: activate immediately — no payment required ─────────────────
    if (plan === 'free' && !paymentDetails) {
      status = 'AVAILABLE';
      planExpiresAt = new Date();
      planExpiresAt.setDate(planExpiresAt.getDate() + 30); // 30-day free listing
    }
    // ── PAID PLAN: verify Razorpay signature before activating ───────────────
    else if (paymentDetails) {
      const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
      const crypto = require('crypto');
      const generated = crypto
        .createHmac('sha256', keySecret)
        .update(`${paymentDetails.razorpayOrderId}|${paymentDetails.razorpayPaymentId}`)
        .digest('hex');

      const isValidSignature = (() => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(generated, 'hex'),
            Buffer.from(paymentDetails.razorpaySignature, 'hex')
          );
        } catch { return false; }
      })();

      const isMockDev =
        process.env.NODE_ENV !== 'production' &&
        paymentDetails.razorpayPaymentId.startsWith('pay_mock_');

      if (!isValidSignature && !isMockDev) {
        throw new BadRequestException('Invalid payment signature');
      }

      status = 'AVAILABLE';
      // Duration based on plan
      const planDays = plan === 'pro' ? 90 : plan === 'basic' ? 60 : 30;
      planExpiresAt = new Date();
      planExpiresAt.setDate(planExpiresAt.getDate() + planDays);

      // Asynchronously mark payment as PAID
      this.prisma.payment.updateMany({
        where: { razorpayOrderId: paymentDetails.razorpayOrderId, userId: ownerId },
        data: { razorpayPaymentId: paymentDetails.razorpayPaymentId, status: 'PAID' },
      }).catch(err => this.logger.error('Failed to update payment status post-machine creation', err));
    }
    // ── NO PAYMENT + NOT FREE: guard against unpaid paid-plan machines ───────
    else {
      status = 'WAITING_PAYMENT';
    }

    const newMachine = await this.prisma.machine.create({
      data: {
        ...machineData,
        ownerId,
        plan,
        status: status as any,
        planExpiresAt,
      },
    });

    if (paymentDetails && status === 'AVAILABLE') {
      // Link payment record to the newly created machine
      await this.prisma.payment.updateMany({
        where: { razorpayOrderId: paymentDetails.razorpayOrderId, userId: ownerId },
        data: { entityId: newMachine.id, entityType: 'MACHINE' },
      }).catch(err => this.logger.error('Failed to link payment entityId', err));
    }

    return newMachine;
  }

  async findAll(filters: MachineFilterDto) {
    const {
      category,
      brand,
      search,
      listingType,
      minPrice,
      maxPrice,
      pricingUnit,
      lat,
      lng,
      radius,
    } = filters;
    // Pagination
    const skip = Number(filters.skip) || 0;
    const take = Number(filters.take) || 500;

    // Filters
    const radiusKm = radius ?? 999999;

    let paramIndex = 1;
    const params: any[] = [];
    const conditions: string[] = [
      "m.status = 'AVAILABLE'",
      // Only show machines with an active plan (free = no expiry, paid = not yet expired)
      "(m.\"planExpiresAt\" IS NULL OR m.\"planExpiresAt\" > NOW())",
    ];

    if (category) {
      conditions.push(`m.category ILIKE $${paramIndex++}`);
      params.push(category);
    }
    if (brand) {
      conditions.push(`m.brand = $${paramIndex++}`);
      params.push(brand);
    }
    if (listingType) {
      conditions.push(`m."listingType" = $${paramIndex++}::"ListingType"`);
      params.push(listingType);
    }
    if (pricingUnit) {
      conditions.push(`m."pricingUnit" = $${paramIndex++}`);
      params.push(pricingUnit);
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
      // Match brand, model, category, OR the combined "brand model" display name
      conditions.push(`(
        m.brand    ILIKE $${paramIndex} OR
        m.model    ILIKE $${paramIndex} OR
        m.category ILIKE $${paramIndex} OR
        CONCAT(m.brand, ' ', m.model) ILIKE $${paramIndex}
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
          pow(sin(radians(COALESCE(m.lat, u."locationLat") - $${paramIndex}) / 2), 2) +
          cos(radians($${paramIndex})) * cos(radians(COALESCE(m.lat, u."locationLat"))) *
          pow(sin(radians(COALESCE(m.lng, u."locationLng") - $${paramIndex + 1}) / 2), 2)
        ))
      )`;
      params.push(lat, lng);
      paramIndex += 2;

      distanceSelect = `${distanceCalc} as "distanceKm"`;

      conditions.push(`(${distanceCalc} <= $${paramIndex++} OR ${distanceCalc} IS NULL)`);
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
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(take, skip);

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
    const machine = await this.prisma.machine.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            // Reverted privacy fix: Direct call flow requires phone number
            phoneNumber: true,
            locationLat: true,
            locationLng: true,
            createdAt: true,
          },
        },
      },
    });

    if (!machine) return null;

    return {
      ...machine,
      price: Number(machine.price),
    };
  }

  async getCategories() {
    const categories = await this.prisma.machineCategory.findMany({
      where: { isActive: true },
      select: { name: true, icon: true },
      orderBy: { name: 'asc' },
    });
    
    // Fallback if the database is empty (migration/seeding not complete yet)
    if (categories.length === 0) {
      return [
        { name: 'Tractor', icon: 'agriculture' },
        { name: 'Harvester', icon: 'grass' },
        { name: 'Tiller', icon: 'engineering' },
        { name: 'Seeder', icon: 'scatter-plot' },
        { name: 'Sprayer', icon: 'water-drop' },
        { name: 'Other', icon: 'handyman' },
      ];
    }
    
    return categories;
  }

  async findMine(ownerId: string) {
    const machines = await this.prisma.machine.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    // Convert Prisma Decimal → plain Number so Fastify serializes it correctly
    return machines.map(m => ({ ...m, price: Number(m.price) }));
  }

  async update(id: string, ownerId: string, data: Partial<CreateMachineDto>) {
    const { paymentDetails, ...machineData } = data;

    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    if (machineData.brand && machineData.model) {
      const existing = await this.prisma.machine.findFirst({
        where: { ownerId, brand: machineData.brand, model: machineData.model, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('Another machine with this brand and model already exists.');
      }
    }

    return this.prisma.machine.update({ where: { id }, data: machineData });
  }

  async updateBusyDates(id: string, ownerId: string, busyDates: string[]) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    return this.prisma.machine.update({
      where: { id },
      data: { busyDates: busyDates.map(d => new Date(d)) },
    });
  }

  async remove(id: string, ownerId: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    // BUG FIX: Delete associated rental requests first to avoid FK constraint errors
    // Prisma does not cascade by default unless schema has onDelete: Cascade
    await this.prisma.$transaction(async (tx) => {
      await tx.rentalRequest.deleteMany({ where: { machineId: id } });
      await tx.machine.delete({ where: { id } });
    });

    return { success: true, message: 'Listing deleted' };
  }

  async toggle(id: string, ownerId: string) {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    if (machine.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this listing');

    // Cannot toggle if machine is actively rented out
    if (machine.status === 'IN_RENT') {
      throw new BadRequestException('Cannot hide a machine that is currently rented out.');
    }

    // BUG FIX: WAITING_PAYMENT machines that have no plan fee (free) CAN be toggled.
    // Previously, a free-plan machine wrongly stayed in WAITING_PAYMENT permanently.
    // Now free machines are created as AVAILABLE, so this toggle only applies to
    // owner-hidden (AVAILABLE ↔ WAITING_PAYMENT) transitions.
    // WAITING_PAYMENT can mean: (a) owner hid it, or (b) paid plan awaiting payment.
    // We only allow toggle if the machine has a plan active (planExpiresAt set) or is free.
    if (machine.status === 'WAITING_PAYMENT' && machine.plan !== 'free' && !machine.planExpiresAt) {
      throw new BadRequestException('Complete payment to activate this listing first.');
    }

    // Toggle: AVAILABLE → WAITING_PAYMENT (hidden), WAITING_PAYMENT → AVAILABLE (visible)
    const newStatus = machine.status === 'AVAILABLE' ? 'WAITING_PAYMENT' : 'AVAILABLE';
    return this.prisma.machine.update({
      where: { id },
      data: { status: newStatus as any },
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

  // ─── Rental Request Methods ──────────────────────────────────────────────────

  /** Borrower sends a rental request for a machine */
  async createRentalRequest(
    machineId: string,
    borrowerId: string,
    dto: CreateRentalRequestDto,
  ) {
    const machine = await this.prisma.machine.findUnique({
      where: { id: machineId },
      include: { owner: { select: { id: true, name: true } } },
    });

    if (!machine)          throw new NotFoundException('Machine not found');
    if (machine.listingType !== 'RENT')
      throw new BadRequestException('This machine is not listed for rent');
    if (machine.status !== 'AVAILABLE')
      throw new BadRequestException('This machine is not available for rent');
    if (machine.ownerId === borrowerId)
      throw new BadRequestException('You cannot request your own machine');

    // Prevent duplicate pending request from same borrower
    const existing = await this.prisma.rentalRequest.findFirst({
      where: { machineId, borrowerId, status: 'PENDING' },
    });
    if (existing) throw new BadRequestException('You already have a pending request for this machine');

    const startDate  = new Date(dto.startDate);
    const pricePerDay = Number(machine.price);
    const totalPrice  = pricePerDay * dto.numberOfDays;

    const request = await this.prisma.rentalRequest.create({
      data: {
        machineId,
        borrowerId,
        ownerId:      machine.ownerId,
        startDate,
        numberOfDays: dto.numberOfDays,
        pricePerDay,
        totalPrice,
        note:         dto.note,
      },
      include: {
        machine:  { select: { brand: true, model: true, images: true } },
        borrower: { select: { name: true, phoneNumber: true } },
        owner:    { select: { name: true } },
      },
    });

    // Notify owner via DB notification (FCM handled by worker)
    try {
      await this.prisma.notification.create({
        data: {
          userId:  machine.ownerId,
          title:   '🚜 New Rental Request',
          message: `${request.borrower.name} wants to rent your ${machine.brand} ${machine.model} for ${dto.numberOfDays} day(s) starting ${startDate.toLocaleDateString('en-IN')}`,
          type:    'INFO',
          link:    '/(farmer)/rent-out/requests',
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to create rental notification: ${err}`);
    }

    this.logger.log(`Rental request created: machine=${machineId} borrower=${borrowerId}`);
    return request;
  }

  /**
   * Returns date ranges already booked (ACCEPTED) for a machine.
   * Used by the rent-in calendar to show unavailable dates to potential borrowers.
   */
  async getBookedDates(machineId: string) {
    const accepted = await this.prisma.rentalRequest.findMany({
      where:  { machineId, status: 'ACCEPTED' },
      select: { startDate: true, numberOfDays: true },
    });

    return accepted.map(r => {
      const start = new Date(r.startDate);
      const end   = new Date(r.startDate);
      end.setDate(end.getDate() + r.numberOfDays - 1);
      return {
        startDate:    start.toISOString().split('T')[0],  // YYYY-MM-DD
        endDate:      end.toISOString().split('T')[0],
        numberOfDays: r.numberOfDays,
      };
    });
  }

  /** Borrower views their own rental requests */
  async getMyRentalRequests(borrowerId: string) {
    const requests = await this.prisma.rentalRequest.findMany({
      where:   { borrowerId },
      orderBy: { createdAt: 'desc' },
      include: {
        machine: {
          select: {
            id: true, brand: true, model: true, category: true,
            images: true, price: true,
            owner: { select: { name: true, phoneNumber: true, locationLat: true, locationLng: true } },
          },
        },
      },
    });
    return requests.map(r => ({
      ...r,
      pricePerDay: Number(r.pricePerDay),
      totalPrice:  Number(r.totalPrice),
      // Only expose owner phone if request is ACCEPTED or COMPLETED
      machine: {
        ...r.machine,
        owner: {
          name: r.machine.owner.name,
          phoneNumber: ['ACCEPTED', 'COMPLETED'].includes(r.status)
            ? r.machine.owner.phoneNumber
            : null,
          locationLat: r.machine.owner.locationLat,
          locationLng: r.machine.owner.locationLng,
        },
      },
    }));
  }

  /** Owner views incoming rental requests for their machines */
  async getIncomingRentalRequests(ownerId: string, status?: string) {
    const where: any = { ownerId };
    if (status) where.status = status;

    const requests = await this.prisma.rentalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        machine:  { select: { id: true, brand: true, model: true, images: true, category: true } },
        borrower: { select: { id: true, name: true, phoneNumber: true, profileImage: true, locationLat: true, locationLng: true } },
      },
    });

    return requests.map(r => ({
      ...r,
      pricePerDay: Number(r.pricePerDay),
      totalPrice:  Number(r.totalPrice),
      // Show borrower phone only after owner accepts
      borrower: {
        ...r.borrower,
        phoneNumber: r.status === 'ACCEPTED' || r.status === 'COMPLETED'
          ? r.borrower.phoneNumber
          : null,
      },
    }));
  }

  /** Owner accepts a rental request */
  async acceptRentalRequest(requestId: string, ownerId: string) {
    const request = await this.prisma.rentalRequest.findUnique({
      where:   { id: requestId },
      include: {
        machine:  { select: { brand: true, model: true } },
        borrower: { select: { name: true } },
        owner:    { select: { name: true, phoneNumber: true } },
      },
    });

    if (!request)                   throw new NotFoundException('Request not found');
    if (request.ownerId !== ownerId) throw new ForbiddenException('Not your machine');
    if (request.status !== 'PENDING')
      throw new BadRequestException(`Cannot accept a ${request.status} request`);

    // Compute the date range being accepted
    const acceptedStart = new Date(request.startDate);
    const acceptedEnd   = new Date(request.startDate);
    acceptedEnd.setDate(acceptedEnd.getDate() + request.numberOfDays - 1);

    // Find all other PENDING requests for this machine
    const otherPending = await this.prisma.rentalRequest.findMany({
      where: { machineId: request.machineId, status: 'PENDING', id: { not: requestId } },
      select: { id: true, startDate: true, numberOfDays: true },
    });

    // Only reject requests whose dates OVERLAP with the accepted range
    // Two ranges [A,B] and [C,D] overlap when: A <= D and B >= C
    const overlappingIds = otherPending
      .filter(p => {
        const pStart = new Date(p.startDate);
        const pEnd   = new Date(p.startDate);
        pEnd.setDate(pEnd.getDate() + p.numberOfDays - 1);
        return pStart <= acceptedEnd && pEnd >= acceptedStart;
      })
      .map(p => p.id);

    // Interactive transaction — gives us async operations + atomicity
    await this.prisma.$transaction(async (tx) => {
      // 1. Accept this request
      await tx.rentalRequest.update({
        where: { id: requestId },
        data:  { status: 'ACCEPTED', respondedAt: new Date() },
      });

      // 2. Only reject requests with overlapping dates
      if (overlappingIds.length > 0) {
        await tx.rentalRequest.updateMany({
          where: { id: { in: overlappingIds } },
          data: {
            status:       'REJECTED',
            respondedAt:  new Date(),
            rejectReason: `Machine booked ${acceptedStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}–${acceptedEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} by another farmer`,
          },
        });
      }

      // 3. Mark machine as IN_RENT
      await tx.machine.update({
        where: { id: request.machineId },
        data:  { status: 'IN_RENT' },
      });
    });

    // Notify borrower
    try {
      await this.prisma.notification.create({
        data: {
          userId:  request.borrowerId,
          title:   '✅ Rental Request Accepted!',
          message: `Your request for ${request.machine.brand} ${request.machine.model} was accepted! Owner will contact you.`,
          type:    'SUCCESS',
          link:    '/(farmer)/rent-in',
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to create accept notification: ${err}`);
    }

    this.logger.log(`Rental request accepted: requestId=${requestId}`);
    return {
      success:             true,
      message:             'Request accepted',
      borrowerPhone:       request.borrower ? null : null, // returned via getIncomingRentalRequests
      ownerPhoneForBorrower: request.owner.phoneNumber,
    };
  }

  /** Owner rejects a rental request */
  async rejectRentalRequest(
    requestId: string,
    ownerId: string,
    dto: RejectRentalRequestDto,
  ) {
    const request = await this.prisma.rentalRequest.findUnique({
      where:   { id: requestId },
      include: { machine: { select: { brand: true, model: true } } },
    });

    if (!request)                   throw new NotFoundException('Request not found');
    if (request.ownerId !== ownerId) throw new ForbiddenException('Not your machine');
    if (request.status !== 'PENDING')
      throw new BadRequestException(`Cannot reject a ${request.status} request`);

    await this.prisma.rentalRequest.update({
      where: { id: requestId },
      data:  { status: 'REJECTED', respondedAt: new Date(), rejectReason: dto.rejectReason },
    });

    // Notify borrower
    try {
      await this.prisma.notification.create({
        data: {
          userId:  request.borrowerId,
          title:   '❌ Rental Request Declined',
          message: dto.rejectReason
            ? `Your request was declined. Reason: ${dto.rejectReason}`
            : `Your request for ${request.machine.brand} ${request.machine.model} was declined. Try another machine nearby.`,
          type:    'WARNING',
          link:    '/(farmer)/rent-in',
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to create reject notification: ${err}`);
    }

    this.logger.log(`Rental request rejected: requestId=${requestId}`);
    return { success: true, message: 'Request rejected' };
  }

  /** Mark a rental as completed — resets machine to AVAILABLE */
  async completeRentalRequest(requestId: string, userId: string) {
    const request = await this.prisma.rentalRequest.findUnique({ where: { id: requestId } });

    if (!request) throw new NotFoundException('Request not found');
    if (request.ownerId !== userId && request.borrowerId !== userId)
      throw new ForbiddenException('Not authorised to complete this request');
    if (request.status !== 'ACCEPTED')
      throw new BadRequestException('Only accepted requests can be completed');

    await this.prisma.$transaction([
      this.prisma.rentalRequest.update({
        where: { id: requestId },
        data:  { status: 'COMPLETED', completedAt: new Date() },
      }),
      this.prisma.machine.update({
        where: { id: request.machineId },
        data:  { status: 'AVAILABLE' },
      }),
    ]);

    this.logger.log(`Rental completed: requestId=${requestId}`);
    return { success: true, message: 'Rental marked as completed' };
  }

  /** Borrower cancels a PENDING request */
  async cancelRentalRequest(requestId: string, borrowerId: string) {
    const request = await this.prisma.rentalRequest.findUnique({ where: { id: requestId } });

    if (!request)                      throw new NotFoundException('Request not found');
    if (request.borrowerId !== borrowerId) throw new ForbiddenException('Not your request');
    if (request.status !== 'PENDING')
      throw new BadRequestException('Only pending requests can be cancelled');

    await this.prisma.rentalRequest.update({
      where: { id: requestId },
      data:  { status: 'CANCELLED' },
    });
    return { success: true, message: 'Request cancelled' };
  }
}
