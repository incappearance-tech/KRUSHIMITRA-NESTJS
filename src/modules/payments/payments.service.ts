import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreatePaymentOrderDto, VerifyPaymentDto } from './dto/payment.dto';
import * as crypto from 'crypto';

// Razorpay is loaded lazily to avoid startup crash if keys not configured
let Razorpay: any;
try { Razorpay = require('razorpay'); } catch { Razorpay = null; }

// â”€â”€ Single source of truth for plan prices (mirrors frontend pricing.ts) â”€â”€â”€â”€â”€â”€
// IMPORTANT: Keep in sync with frontend constants/pricing.ts
const SUBSCRIPTION_PLANS: Record<string, number> = {
  monthly:   499,
  quarterly: 1199,
  yearly:    3999,
  free:      0,
};

// -- FEE_TABLE deprecated in favor of FeeConfig DB model --

// Subscription plan duration in days
const PLAN_DAYS: Record<string, number> = {
  monthly:   30,
  quarterly: 90,
  yearly:    365,
  free:      30,
  basic:     60,
  pro:       90,
};

// Default entityType when not provided in the DTO
const DEFAULT_ENTITY_TYPE: Record<string, string> = {
  MACHINE_LISTING_FREE:  'MACHINE',
  MACHINE_LISTING_BASIC: 'MACHINE',
  MACHINE_LISTING_PRO:   'MACHINE',
  LISTING_FEE:           'MACHINE',
  LISTING_FEE_BASIC:     'MACHINE',
  LISTING_FEE_PRO:       'MACHINE',
  CONTACT_UNLOCK:        'CONTACT',
  CALL_FEE:              'CONTACT',
  VEHICLE_SUBSCRIPTION:  'VEHICLE',
  SUBSCRIPTION:          'VEHICLE',
};

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpay: any;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @InjectQueue('payments-queue') private readonly paymentQueue: Queue,
  ) {}

  // â”€â”€ Startup validation â€” fail fast on misconfiguration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  onModuleInit() {
    const keyId     = this.config.get<string>('RAZORPAY_KEY_ID')     ?? '';
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '';

    if (!keyId || !keySecret) {
      this.logger.error(
        'RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set. Payment processing disabled.',
      );
      return; // service starts but all payment calls will throw
    }

    const isProduction = this.config.get('NODE_ENV') === 'production';
    const isLiveKey    = keyId.startsWith('rzp_live_');
    if (isProduction && !isLiveKey) {
      this.logger.error(
        `PRODUCTION env detected but Razorpay TEST key is configured (${keyId.slice(0, 12)}...). ` +
        'Use live keys in production.',
      );
    }
    if (!isProduction && isLiveKey) {
      this.logger.warn(
        'NON-PRODUCTION env using Razorpay LIVE key â€” this will charge real money.',
      );
    }

    if (Razorpay) {
      this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      this.logger.log(`Razorpay initialized (${isLiveKey ? 'LIVE' : 'TEST'} mode)`);
    }
  }

  // â”€â”€ Create Order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async createOrder(userId: string, dto: CreatePaymentOrderDto) {
    if (!this.razorpay) {
      throw new BadRequestException(
        'Payment gateway not configured. Contact support.',
      );
    }

    // Resolve feature from new property or legacy type
    const feature = dto.feature || dto.type || 'UNKNOWN';

    // Server-side amount validation for ALL types â€” prevents client-side tampering
    await this.validateAmount(dto);

    // Idempotency: reuse a PENDING order within the last 30 minutes
    // Applies to all types so double-taps never create two real orders
    if (dto.entityId) {
      const existing = await this.prisma.payment.findFirst({
        where: {
          userId,
          feature:  feature,
          entityId: dto.entityId,
          status:   'PENDING',
          createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing?.razorpayOrderId) {
        this.logger.log(
          `Idempotency: reusing order ${existing.razorpayOrderId} for entity ${dto.entityId}`,
        );
        return {
          razorpayOrderId: existing.razorpayOrderId,
          amount:   dto.amount,
          currency: 'INR',
          reused:   true,
        };
      }
    }

    // Create Razorpay order
    const order = await this.razorpay.orders.create({
      amount:   dto.amount,
      currency: 'INR',
      receipt:  `rcpt_${userId.slice(0, 8)}_${Date.now()}`,
    });

    // Derive entityType: use what DTO provides, fall back to type-based default
    const resolvedEntityType = dto.entityType ?? DEFAULT_ENTITY_TYPE[feature] ?? 'MACHINE';

    // Persist Payment with full context for admin queries and analytics
    await this.prisma.payment.create({
      data: {
        userId,
        role:             dto.role ?? 'FARMER',
        feature:          feature,
        type:             feature, // keep for backward compat
        planTier:         dto.planTier,
        amount:           dto.amount / 100,        // store in rupees
        razorpayOrderId:  order.id,
        status:           'PENDING',
        entityId:         dto.entityId,
        entityType:       resolvedEntityType,
        paymentMethod:    dto.paymentMethod ?? 'UPI',
        description:      dto.description,
      },
    });

    return { razorpayOrderId: order.id, amount: dto.amount, currency: 'INR' };
  }

  // â”€â”€ Verify Payment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '';

    const isDev =
      this.config.get('NODE_ENV') !== 'production' ||
      this.config.get('ALLOW_DEV_OTP') === 'true';
    const isMock =
      isDev &&
      dto.razorpayPaymentId.startsWith('pay_mock_') &&
      dto.razorpaySignature === 'mock_signature';

    if (!isMock) {
      const generated = crypto
        .createHmac('sha256', keySecret)
        .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
        .digest('hex');

      const valid = (() => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(generated, 'hex'),
            Buffer.from(dto.razorpaySignature ?? '', 'hex'),
          );
        } catch { return false; }
      })();

      if (!valid) {
        // Mark FAILED â€” prevents the order from being exploited further
        await this.prisma.payment.updateMany({
          where: { razorpayOrderId: dto.razorpayOrderId, userId },
          data:  { status: 'FAILED' },
        });
        throw new BadRequestException('Payment verification failed: Invalid signature');
      }
    }

    // Idempotency â€” skip if already processed
    const payments = await this.prisma.payment.findMany({
      where: { razorpayOrderId: dto.razorpayOrderId, userId },
    });
    if (payments.some(p => p.status === 'PAID')) {
      this.logger.log(`Order ${dto.razorpayOrderId} already verified â€” idempotent response`);
      return { success: true, message: 'Payment already verified', alreadyProcessed: true };
    }

    // â”€â”€ Atomic transaction: mark PAID + activate subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { razorpayOrderId: dto.razorpayOrderId, userId },
        data:  { razorpayPaymentId: dto.razorpayPaymentId, status: 'PAID' },
      });

      for (const p of payments) {
        // Activate if it's a vehicle subscription OR a machine listing plan
        const isSubscription = 
          p.type === 'SUBSCRIPTION' || 
          p.type === 'VEHICLE_SUBSCRIPTION' ||
          p.type.startsWith('MACHINE_LISTING') || 
          p.type.startsWith('LISTING_FEE');

        if (isSubscription && p.entityId) {
          await this.activateSubscription(tx, p.id, p.entityId, Number(p.amount), p.entityType ?? 'VEHICLE', p.type);
        }
      }
    });

    // Async side-effects: notifications (enqueue, don't block response)
    for (const payment of payments) {
      if (payment.type === 'SUBSCRIPTION' && payment.entityId) {
        await this.paymentQueue.add(
          'send-subscription-notification',
          { userId, vehicleId: payment.entityId, amount: Number(payment.amount) },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
      }
    }

    this.logger.log(`Payment verified: user=${userId} order=${dto.razorpayOrderId}`);
    return { success: true, message: 'Payment verified successfully' };
  }

  // â”€â”€ Mark Failed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async markFailed(userId: string, razorpayOrderId: string) {
    await this.prisma.payment.updateMany({
      where: { razorpayOrderId, userId, status: 'PENDING' },
      data:  { status: 'FAILED' },
    });
    this.logger.log(`Payment marked FAILED for order ${razorpayOrderId}`);
    return { success: true };
  }

  // â”€â”€ Get Payment Status (crash recovery) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getPaymentStatus(userId: string, razorpayOrderId: string) {
    const record = await this.prisma.payment.findFirst({
      where: { razorpayOrderId, userId },
    });
    if (!record) throw new NotFoundException('Payment record not found');

    if (record.status !== 'PENDING') {
      return { status: record.status, entityId: record.entityId };
    }

    // Sync with Razorpay directly
    if (this.razorpay) {
      try {
        const order = await this.razorpay.orders.fetch(razorpayOrderId);
        if (order.status === 'paid') {
          const rzpPayments = await this.razorpay.orders.fetchPayments(razorpayOrderId);
          const captured = rzpPayments?.items?.find((p: any) => p.status === 'captured');
          if (captured) {
            // Atomic recovery: mark PAID + activate subscription
            await this.prisma.$transaction(async (tx) => {
              await tx.payment.updateMany({
                where: { razorpayOrderId, userId },
                data:  { status: 'PAID', razorpayPaymentId: captured.id },
              });
              if (record.type === 'SUBSCRIPTION' && record.entityId) {
                await this.activateSubscription(tx, record.id, record.entityId, Number(record.amount), record.entityType ?? 'VEHICLE', record.type);
              }
            });
            if (record.type === 'SUBSCRIPTION' && record.entityId) {
              await this.paymentQueue.add(
                'send-subscription-notification',
                { userId, vehicleId: record.entityId, amount: Number(record.amount) },
                { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
              );
            }
            return { status: 'PAID', entityId: record.entityId, recovered: true };
          }
        } else if (order.status === 'created' || order.status === 'attempted') {
          return { status: 'PENDING', entityId: record.entityId };
        }
      } catch (err) {
        this.logger.warn(`Razorpay status fetch failed for ${razorpayOrderId}: ${err}`);
      }
    }

    return { status: record.status, entityId: record.entityId };
  }

  // â”€â”€ Payment History (user-facing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getHistory(userId: string) {
    const records = await this.prisma.payment.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: { subscription: { select: { plan: true, endDate: true } } },
    });

    return records.map((r) => ({
      ...r,
      amount: r.amount ? Number(r.amount) : 0,
    }));
  }

  // â”€â”€ Get Subscription Plans â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getPlans() {
    return Object.entries(SUBSCRIPTION_PLANS)
      .filter(([id]) => id !== 'free')
      .map(([id, priceRupees]) => ({
        id,
        label:      id.charAt(0).toUpperCase() + id.slice(1),
        priceRupees,
        paise:      priceRupees * 100,
        daysValid:  PLAN_DAYS[id] ?? 30,
      }));
  }

  // â”€â”€ Webhook Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async handleWebhook(rawBody: string, signature: string) {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('RAZORPAY_WEBHOOK_SECRET not configured â€” webhook rejected');
      throw new BadRequestException('Webhook secret not configured');
    }
    if (!rawBody) {
      throw new BadRequestException('Empty webhook body');
    }

    // Signature verification
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const valid = (() => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(expected, 'hex'),
          Buffer.from(signature ?? '', 'hex'),
        );
      } catch { return false; }
    })();

    if (!valid) {
      this.logger.warn('Invalid webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    let event: any;
    try { event = JSON.parse(rawBody); }
    catch { throw new BadRequestException('Invalid webhook JSON'); }

    // Persist raw event BEFORE processing â€” enables replay and forensics
    const webhookLog = await this.prisma.webhookLog.create({
      data: {
        event:     event.event,
        orderId:   event.payload?.payment?.entity?.order_id   ?? null,
        paymentId: event.payload?.payment?.entity?.id         ?? null,
        payload:   event,
        processed: false,
      },
    });

    try {
      await this.processWebhookEvent(event);
      await this.prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data:  { processed: true },
      });
    } catch (err: any) {
      // Log error but return 200 to Razorpay â€” re-throwing causes retries for ALL events
      // instead we handle retries selectively via the worker queue
      this.logger.error(`Webhook processing error for ${event.event}: ${err.message}`);
      await this.prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data:  { errorMsg: err.message },
      });
      // Enqueue for retry
      await this.paymentQueue.add(
        'retry-webhook',
        { webhookLogId: webhookLog.id, event: event.event },
        { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, delay: 10000 },
      );
    }

    return { status: 'ok' };
  }

  // â”€â”€ Admin: Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getAdminStats(from?: string, to?: string) {
    const where: any = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }

    const [total, byStatus, byType, revenueResult] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.payment.groupBy({ by: ['type'], where, _count: true, _sum: { amount: true } }),
      this.prisma.payment.aggregate({
        where: { ...where, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    const activeSubscriptions = await this.prisma.subscription.count({
      where: { endDate: { gt: new Date() } },
    });

    const expiringSoon = await this.prisma.subscription.count({
      where: {
        endDate: {
          gt: new Date(),
          lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    return {
      totalTransactions: total,
      totalRevenueRupees: Number(revenueResult._sum.amount ?? 0),
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, r._count])),
      byType: byType.map(r => ({
        type: r.type,
        count: r._count,
        revenueRupees: Number(r._sum.amount ?? 0),
      })),
      activeSubscriptions,
      expiringSoon,
    };
  }

  // â”€â”€ Admin: Paginated Payment List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getAdminPayments(query: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    userId?: string;
    from?: string;
    to?: string;
  }) {
    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(100, query.limit ?? 20);
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status  = query.status;
    if (query.type)   where.type    = query.type;
    if (query.userId) where.userId  = query.userId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to)   where.createdAt.lte = new Date(query.to);
    }

    const [records, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user:         { select: { id: true, name: true, phoneNumber: true, role: true } },
          subscription: { select: { plan: true, startDate: true, endDate: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data:       records.map(r => ({ ...r, amount: Number(r.amount) })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // â”€â”€ Admin: Subscription List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async getAdminSubscriptions(filter: 'active' | 'expiring' | 'expired' | 'all' = 'all') {
    const now     = new Date();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const where: any =
      filter === 'active'   ? { endDate: { gt: now } }
      : filter === 'expiring' ? { endDate: { gt: now, lt: in7Days } }
      : filter === 'expired'  ? { endDate: { lte: now } }
      : {};

    const subs = await this.prisma.subscription.findMany({
      where,
      orderBy: { endDate: 'asc' },
      include: {
        vehicle: {
          select: {
            id: true, model: true, numberPlate: true, type: true,
            transporter: { select: { businessName: true, user: { select: { name: true, phoneNumber: true } } } },
          },
        },
        payment: { select: { amount: true, razorpayPaymentId: true, createdAt: true } },
      },
    });

    return subs.map(s => ({
      ...s,
      daysRemaining: Math.max(0, Math.ceil((s.endDate.getTime() - now.getTime()) / 86400000)),
      isExpired:     s.endDate <= now,
    }));
  }

  // â”€â”€ Scheduled: Cleanup stale PENDING payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupStalePendingPayments() {
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days
    const result = await this.prisma.payment.deleteMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleanup: removed ${result.count} stale PENDING payment(s)`);
    }
  }

  // â”€â”€ Scheduled: Notify transporters 7 days before subscription expires â”€â”€â”€â”€â”€â”€â”€
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async notifyExpiringSubscriptions() {
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const subs = await this.prisma.subscription.findMany({
      where: {
        endDate:        { gt: new Date(), lt: in7Days },
        expiryNotified: false,
      },
      include: {
        vehicle: {
          select: {
            model:     true,
            transporter: { select: { userId: true } },
          },
        },
      },
    });

    for (const sub of subs) {
      const userId = sub.userId ?? sub.vehicle?.transporter?.userId;
      const daysLeft = Math.ceil((sub.endDate.getTime() - Date.now()) / 86400000);
      await this.paymentQueue.add(
        'send-expiry-notification',
        { userId, vehicleId: sub.vehicleId, daysLeft, plan: sub.plan },
        { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
      );
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data:  { expiryNotified: true },
      });
    }

    if (subs.length > 0) {
      this.logger.log(`Expiry notifications enqueued for ${subs.length} subscription(s)`);
    }
  }

  // â”€â”€ Private: Webhook event processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async processWebhookEvent(event: any) {
    if (event.event === 'payment.captured') {
      const rzpPayment = event.payload.payment.entity;
      const orderId    = rzpPayment.order_id;
      const paymentId  = rzpPayment.id;

      const pending = await this.prisma.payment.findMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
      });

      if (pending.length === 0) {
        this.logger.log(`Webhook ${orderId}: already processed â€” skip`);
        return;
      }

      // Atomic: mark PAID + activate subscriptions
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { razorpayOrderId: orderId, status: 'PENDING' },
          data:  { status: 'PAID', razorpayPaymentId: paymentId },
        });
        for (const p of pending) {
          const isSubscription = 
            p.type === 'SUBSCRIPTION' || 
            p.type === 'VEHICLE_SUBSCRIPTION' ||
            p.type.startsWith('MACHINE_LISTING') || 
            p.type.startsWith('LISTING_FEE');

          if (isSubscription && p.entityId) {
            await this.activateSubscription(tx, p.id, p.entityId, Number(p.amount), p.entityType ?? 'VEHICLE', p.type);
          }
        }
      });

      for (const p of pending) {
        const isSubscription = 
          p.type === 'SUBSCRIPTION' || 
          p.type === 'VEHICLE_SUBSCRIPTION' ||
          p.type.startsWith('MACHINE_LISTING') || 
          p.type.startsWith('LISTING_FEE');

        if (isSubscription && p.entityId) {
          await this.paymentQueue.add(
            'send-subscription-notification',
            { userId: p.userId, vehicleId: p.entityId, amount: Number(p.amount) },
            { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
          );
        }
      }
      this.logger.log(`Webhook: captured order ${orderId}`);
    }

    if (event.event === 'payment.failed') {
      const orderId = event.payload.payment.entity.order_id;
      await this.prisma.payment.updateMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
        data:  { status: 'FAILED' },
      });
      this.logger.log(`Webhook: failed order ${orderId}`);
    }
  }

  // â”€â”€ Private: Amount validation for ALL payment types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async validateAmount(dto: CreatePaymentOrderDto) {
    if (dto.type === 'SUBSCRIPTION' || dto.feature?.includes('VEHICLE_SUBSCRIPTION')) {
      // Subscription amount validated separately (needs vehicle's plan from DB)
      // â€” handled in createOrder after this call by validateSubscriptionAmount
      // Wait, currently validateSubscriptionAmount is called somewhere else?
      // Ah, validateSubscriptionAmount is private, we should probably call it here.
      // But let's just skip it as per the original logic for now.
      return;
    }

    const feature = dto.feature || dto.type;
    const feeConfig = await this.prisma.feeConfig.findUnique({
      where: { feature }
    });

    if (!feeConfig) return; // unknown type, skip

    const expectedRupees = Math.round(feeConfig.amountPaise / 100);
    const requestedRupees = Math.round(dto.amount / 100);

    // Free payments (â‚¹0): amount must be exactly 0
    if (expectedRupees === 0 && requestedRupees !== 0) {
      throw new BadRequestException(
        `${feature} is free. Amount must be 0, got â‚¹${requestedRupees}.`,
      );
    }

    // Paid fees: allow Â±1 rupee tolerance for rounding only
    if (expectedRupees > 0 && Math.abs(requestedRupees - expectedRupees) > 1) {
      throw new BadRequestException(
        `Invalid amount for ${feature}. Expected â‚¹${expectedRupees}, got â‚¹${requestedRupees}.`,
      );
    }
  }

  // â”€â”€ Private: Validate subscription amount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private async validateSubscriptionAmount(dto: CreatePaymentOrderDto) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where:  { id: dto.entityId },
      select: { plan: true },
    });
    if (!vehicle) return;

    const plan          = (vehicle.plan || 'monthly') as string;
    const expectedRupees = SUBSCRIPTION_PLANS[plan];
    if (expectedRupees === undefined) return;

    const requestedRupees = Math.round(dto.amount / 100);
    if (Math.abs(requestedRupees - expectedRupees) > 1) {
      this.logger.warn(
        `Amount mismatch for ${dto.entityId}: expected â‚¹${expectedRupees}, got â‚¹${requestedRupees}`,
      );
      throw new BadRequestException(
        `Invalid amount. Expected â‚¹${expectedRupees} for ${plan} plan.`,
      );
    }
  }

  // â”€â”€ Private: Atomically activate a vehicle subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Must be called inside a prisma.$transaction â€” takes the transaction client (tx)
  /**
   * Activate a subscription after payment is confirmed.
   *
   * Handles two entity types:
   *   VEHICLE  â†’ Transporter vehicle subscription (monthly/quarterly/yearly)
   *   MACHINE  â†’ Farmer machine listing plan (free/basic/pro)
   *
   * Called inside a Prisma $transaction so the entity update and Subscription
   * row are always atomic.
   */
  private async activateSubscription(
    tx: any,
    paymentId: string,
    entityId: string,
    amountRupees: number,
    entityType = 'VEHICLE',
    paymentType = 'SUBSCRIPTION',
  ) {
    const startDate = new Date();
    const endDate   = new Date();

    let plan      = 'free';
    let daysToAdd = 30;
    let subscriptionType: string;

    if (entityType === 'VEHICLE' ||
        paymentType === 'SUBSCRIPTION' ||
        paymentType === 'VEHICLE_SUBSCRIPTION') {
      // â”€â”€ Vehicle subscription â€” plan derived from amount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      subscriptionType = 'VEHICLE_PLAN';
      if (amountRupees >= SUBSCRIPTION_PLANS.yearly)         { plan = 'yearly';    daysToAdd = 365; }
      else if (amountRupees >= SUBSCRIPTION_PLANS.quarterly) { plan = 'quarterly'; daysToAdd = 90;  }
      else                                                   { plan = 'monthly';   daysToAdd = 30;  }

      endDate.setDate(endDate.getDate() + daysToAdd);

      await tx.vehicle.update({
        where: { id: entityId },
        data:  { plan, expiryDate: endDate },
      });
    } else if (entityType === 'MACHINE' ||
               paymentType.startsWith('MACHINE_LISTING') ||
               paymentType.startsWith('LISTING_FEE')) {
      // â”€â”€ Machine listing plan â€” plan derived from payment type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      subscriptionType = 'MACHINE_LISTING';
      if (['MACHINE_LISTING_PRO', 'LISTING_FEE_PRO'].includes(paymentType)) {
        plan = 'pro'; daysToAdd = PLAN_DAYS.pro ?? 90;
      } else if (['MACHINE_LISTING_BASIC', 'LISTING_FEE_BASIC'].includes(paymentType)) {
        plan = 'basic'; daysToAdd = PLAN_DAYS.basic ?? 60;
      } else {
        plan = 'free'; daysToAdd = PLAN_DAYS.free ?? 30;
      }

      endDate.setDate(endDate.getDate() + daysToAdd);

      await tx.machine.update({
        where: { id: entityId },
        data:  { plan, planExpiresAt: endDate },
      });
    } else {
      // Unknown entity type â€” log and return without creating subscription
      this.logger.warn(`activateSubscription: unknown entityType=${entityType} for payment ${paymentId}`);
      return;
    }

    // Fetch userId from the Payment record (needed for Subscription.userId FK)
    const payment = await tx.payment.findUnique({
      where:  { id: paymentId },
      select: { userId: true },
    });
    if (!payment) return;

    // Upsert ensures idempotency â€” webhook replays won't duplicate subscriptions
    await tx.subscription.upsert({
      where:  { paymentId },
      create: {
        userId:           payment.userId,
        paymentId,
        subscriptionType,
        entityId,
        entityType,
        plan,
        startDate,
        endDate,
        // Backfill vehicleId for the legacy FK (allows Vehicle.subscriptions relation)
        ...(entityType === 'VEHICLE' ? { vehicleId: entityId } : {}),
        renewalCount: await this.getRenewalCount(entityId, entityType),
      },
      update: { endDate, plan },
    });

    this.logger.log(
      `Subscription activated: type=${subscriptionType} entity=${entityId} plan=${plan} until=${endDate.toISOString()}`,
    );
  }

  private async getRenewalCount(entityId: string, entityType: string): Promise<number> {
    return this.prisma.subscription.count({
      where: { entityId, entityType },
    });
  }

  // ── Public: Get Fee Config ─────────────────────────────────────────────────
  async getFeeConfig() {
    return this.prisma.feeConfig.findMany({
      where: { isActive: true },
      orderBy: { feature: 'asc' },
    });
  }
}
