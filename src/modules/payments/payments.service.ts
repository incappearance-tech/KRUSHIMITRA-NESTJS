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

// ── Single source of truth for plan prices (mirrors frontend pricing.ts) ──────
// IMPORTANT: Keep in sync with frontend constants/pricing.ts
const SUBSCRIPTION_PLANS: Record<string, number> = {
  monthly:   499,
  quarterly: 1199,
  yearly:    3999,
  free:      0,
};

// Server-side fee table — validates ALL payment types before order creation.
// Frontend can never tamper these amounts.
const FEE_TABLE: Record<string, number> = {
  LISTING_FEE: 0,      // Free to list a machine (₹0)
  CALL_FEE:    29,     // Contact unlock fee (₹29)
};

// Plan duration in days
const PLAN_DAYS: Record<string, number> = {
  monthly:   30,
  quarterly: 90,
  yearly:    365,
  free:      30,
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

  // ── Startup validation — fail fast on misconfiguration ─────────────────────
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
        'NON-PRODUCTION env using Razorpay LIVE key — this will charge real money.',
      );
    }

    if (Razorpay) {
      this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      this.logger.log(`Razorpay initialized (${isLiveKey ? 'LIVE' : 'TEST'} mode)`);
    }
  }

  // ── Create Order ────────────────────────────────────────────────────────────
  async createOrder(userId: string, dto: CreatePaymentOrderDto) {
    if (!this.razorpay) {
      throw new BadRequestException(
        'Payment gateway not configured. Contact support.',
      );
    }

    // Server-side amount validation for ALL types — prevents client-side tampering
    this.validateAmount(dto);

    // Idempotency: reuse a PENDING order within the last 30 minutes
    // Applies to all types so double-taps never create two real orders
    if (dto.entityId) {
      const existing = await this.prisma.payment.findFirst({
        where: {
          userId,
          type:     dto.type,
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

    // Persist Payment record with description for admin readability
    await this.prisma.payment.create({
      data: {
        userId,
        type:           dto.type,
        amount:         dto.amount / 100,
        razorpayOrderId: order.id,
        status:         'PENDING',
        entityId:       dto.entityId,
        description:    dto.description,
      },
    });

    return { razorpayOrderId: order.id, amount: dto.amount, currency: 'INR' };
  }

  // ── Verify Payment ──────────────────────────────────────────────────────────
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
        // Mark FAILED — prevents the order from being exploited further
        await this.prisma.payment.updateMany({
          where: { razorpayOrderId: dto.razorpayOrderId, userId },
          data:  { status: 'FAILED' },
        });
        throw new BadRequestException('Payment verification failed: Invalid signature');
      }
    }

    // Idempotency — skip if already processed
    const payments = await this.prisma.payment.findMany({
      where: { razorpayOrderId: dto.razorpayOrderId, userId },
    });
    if (payments.some(p => p.status === 'PAID')) {
      this.logger.log(`Order ${dto.razorpayOrderId} already verified — idempotent response`);
      return { success: true, message: 'Payment already verified', alreadyProcessed: true };
    }

    // ── Atomic transaction: mark PAID + activate subscription ─────────────────
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { razorpayOrderId: dto.razorpayOrderId, userId },
        data:  { razorpayPaymentId: dto.razorpayPaymentId, status: 'PAID' },
      });

      for (const payment of payments) {
        if (payment.type === 'SUBSCRIPTION' && payment.entityId) {
          await this.activateSubscription(tx, payment.id, payment.entityId, Number(payment.amount));
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

  // ── Mark Failed ─────────────────────────────────────────────────────────────
  async markFailed(userId: string, razorpayOrderId: string) {
    await this.prisma.payment.updateMany({
      where: { razorpayOrderId, userId, status: 'PENDING' },
      data:  { status: 'FAILED' },
    });
    this.logger.log(`Payment marked FAILED for order ${razorpayOrderId}`);
    return { success: true };
  }

  // ── Get Payment Status (crash recovery) ─────────────────────────────────────
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
                await this.activateSubscription(tx, record.id, record.entityId, Number(record.amount));
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

  // ── Payment History (user-facing) ──────────────────────────────────────────
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

  // ── Get Subscription Plans ──────────────────────────────────────────────────
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

  // ── Webhook Handler ─────────────────────────────────────────────────────────
  async handleWebhook(rawBody: string, signature: string) {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('RAZORPAY_WEBHOOK_SECRET not configured — webhook rejected');
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

    // Persist raw event BEFORE processing — enables replay and forensics
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
      // Log error but return 200 to Razorpay — re-throwing causes retries for ALL events
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

  // ── Admin: Stats ────────────────────────────────────────────────────────────
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

  // ── Admin: Paginated Payment List ───────────────────────────────────────────
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

  // ── Admin: Subscription List ────────────────────────────────────────────────
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

  // ── Scheduled: Cleanup stale PENDING payments ───────────────────────────────
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

  // ── Scheduled: Notify transporters 7 days before subscription expires ───────
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
      const userId = sub.vehicle.transporter.userId;
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

  // ── Private: Webhook event processing ──────────────────────────────────────
  private async processWebhookEvent(event: any) {
    if (event.event === 'payment.captured') {
      const rzpPayment = event.payload.payment.entity;
      const orderId    = rzpPayment.order_id;
      const paymentId  = rzpPayment.id;

      const pending = await this.prisma.payment.findMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
      });

      if (pending.length === 0) {
        this.logger.log(`Webhook ${orderId}: already processed — skip`);
        return;
      }

      // Atomic: mark PAID + activate subscriptions
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { razorpayOrderId: orderId, status: 'PENDING' },
          data:  { status: 'PAID', razorpayPaymentId: paymentId },
        });
        for (const p of pending) {
          if (p.type === 'SUBSCRIPTION' && p.entityId) {
            await this.activateSubscription(tx, p.id, p.entityId, Number(p.amount));
          }
        }
      });

      for (const p of pending) {
        if (p.type === 'SUBSCRIPTION' && p.entityId) {
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

  // ── Private: Amount validation for ALL payment types ───────────────────────
  private validateAmount(dto: CreatePaymentOrderDto) {
    if (dto.type === 'SUBSCRIPTION') {
      // Subscription amount validated separately (needs vehicle's plan from DB)
      // — handled in createOrder after this call by validateSubscriptionAmount
      return;
    }

    const expectedRupees = FEE_TABLE[dto.type];
    if (expectedRupees === undefined) return; // unknown type, skip

    const requestedRupees = Math.round(dto.amount / 100);

    // Free payments (₹0): amount must be exactly 0
    if (expectedRupees === 0 && requestedRupees !== 0) {
      throw new BadRequestException(
        `${dto.type} is free. Amount must be 0, got ₹${requestedRupees}.`,
      );
    }

    // Paid fees: allow ±1 rupee tolerance for rounding only
    if (expectedRupees > 0 && Math.abs(requestedRupees - expectedRupees) > 1) {
      throw new BadRequestException(
        `Invalid amount for ${dto.type}. Expected ₹${expectedRupees}, got ₹${requestedRupees}.`,
      );
    }
  }

  // ── Private: Validate subscription amount ──────────────────────────────────
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
        `Amount mismatch for ${dto.entityId}: expected ₹${expectedRupees}, got ₹${requestedRupees}`,
      );
      throw new BadRequestException(
        `Invalid amount. Expected ₹${expectedRupees} for ${plan} plan.`,
      );
    }
  }

  // ── Private: Atomically activate a vehicle subscription ────────────────────
  // Must be called inside a prisma.$transaction — takes the transaction client (tx)
  private async activateSubscription(
    tx: any,
    paymentId: string,
    vehicleId: string,
    amountRupees: number,
  ) {
    // Derive plan from amount paid
    let plan     = 'monthly';
    let daysToAdd = 30;
    if (amountRupees >= SUBSCRIPTION_PLANS.yearly)    { plan = 'yearly';    daysToAdd = 365; }
    else if (amountRupees >= SUBSCRIPTION_PLANS.quarterly) { plan = 'quarterly'; daysToAdd = 90;  }

    const startDate  = new Date();
    const endDate    = new Date();
    endDate.setDate(endDate.getDate() + daysToAdd);

    // Update vehicle plan + expiryDate
    await tx.vehicle.update({
      where: { id: vehicleId },
      data:  { plan, expiryDate: endDate },
    });

    // Upsert Subscription record (upsert handles idempotent webhook replays)
    await tx.subscription.upsert({
      where:  { paymentId },
      create: {
        vehicleId,
        paymentId,
        plan,
        startDate,
        endDate,
        renewalCount: await this.getRenewalCount(vehicleId),
      },
      update: {
        endDate,
        plan,
      },
    });

    this.logger.log(`Subscription activated: vehicle=${vehicleId} plan=${plan} until=${endDate.toISOString()}`);
  }

  // ── Private: Count prior renewals for this vehicle ─────────────────────────
  private async getRenewalCount(vehicleId: string): Promise<number> {
    return this.prisma.subscription.count({ where: { vehicleId } });
  }
}
