import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreatePaymentOrderDto, VerifyPaymentDto } from './dto/payment.dto';
import * as crypto from 'crypto';

// Razorpay is loaded lazily to avoid startup crash if keys not configured
let Razorpay: any;
try {
  Razorpay = require('razorpay');
} catch {
  Razorpay = null;
}

// ── Plan price table (single source of truth) ────────────────────────────────
const SUBSCRIPTION_PLANS: Record<string, number> = {
  monthly: 499,
  quarterly: 1199,
  yearly: 3999,
  free: 0,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpay: any;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    if (Razorpay) {
      this.razorpay = new Razorpay({
        key_id: this.config.get('RAZORPAY_KEY_ID'),
        key_secret: this.config.get('RAZORPAY_KEY_SECRET'),
      });
    }
  }

  // ── Create Order ─────────────────────────────────────────────────────────
  async createOrder(userId: string, dto: CreatePaymentOrderDto) {
    if (!this.razorpay) {
      throw new BadRequestException(
        'Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }

    // ✅ FIX #4 — Validate amount against server-side plan table for SUBSCRIPTION
    if (dto.type === 'SUBSCRIPTION' && dto.entityId) {
      await this.validateSubscriptionAmount(dto);
    }

    // ✅ FIX #2 — Idempotency: reuse an existing PENDING order for same entity
    if (dto.entityId) {
      const existing = await this.prisma.payment.findFirst({
        where: {
          userId,
          entityId: dto.entityId,
          status: 'PENDING',
          createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) }, // within 30 min
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing?.razorpayOrderId) {
        this.logger.log(`Reusing existing order ${existing.razorpayOrderId} for entity ${dto.entityId}`);
        return {
          razorpayOrderId: existing.razorpayOrderId,
          amount: dto.amount,
          currency: 'INR',
          reused: true,
        };
      }
    }

    const order = await this.razorpay.orders.create({
      amount: dto.amount, // in paise
      currency: 'INR',
      receipt: `rcpt_${userId.slice(0, 8)}_${Date.now()}`,
    });

    await this.prisma.payment.create({
      data: {
        userId,
        type: dto.type,
        amount: dto.amount / 100, // store in rupees
        razorpayOrderId: order.id,
        status: 'PENDING',
        entityId: dto.entityId,
      },
    });

    return { razorpayOrderId: order.id, amount: dto.amount, currency: 'INR' };
  }

  // ── Verify Payment (client-side success callback) ─────────────────────────
  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '';

    // Mock payments allowed when: not production OR ALLOW_DEV_OTP=true (for local testing)
    const isDev =
      this.config.get('NODE_ENV') !== 'production' ||
      this.config.get('ALLOW_DEV_OTP') === 'true';
    const isMockPayment =
      isDev &&
      dto.razorpayPaymentId.startsWith('pay_mock_') &&
      dto.razorpaySignature === 'mock_signature';

    if (!isMockPayment) {
      const generatedSig = crypto
        .createHmac('sha256', keySecret)
        .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
        .digest('hex');

      // Timing-safe comparison prevents side-channel extraction of key secret
      const sigMatch = (() => {
        try {
          return crypto.timingSafeEqual(
            Buffer.from(generatedSig, 'hex'),
            Buffer.from(dto.razorpaySignature ?? '', 'hex'),
          );
        } catch { return false; }
      })();
      if (!sigMatch) {
        // ✅ FIX #6 — Mark payment FAILED on bad signature
        await this.prisma.payment.updateMany({
          where: { razorpayOrderId: dto.razorpayOrderId, userId },
          data: { status: 'FAILED' },
        });
        throw new BadRequestException('Payment verification failed: Invalid signature');
      }
    }

    // ✅ FIX #3 — Idempotency: skip if already PAID
    const payments = await this.prisma.payment.findMany({
      where: { razorpayOrderId: dto.razorpayOrderId, userId },
    });

    const alreadyPaid = payments.some(p => p.status === 'PAID');
    if (alreadyPaid) {
      this.logger.log(`Order ${dto.razorpayOrderId} already verified — returning cached success`);
      return { success: true, message: 'Payment already verified', alreadyProcessed: true };
    }

    await this.prisma.payment.updateMany({
      where: { razorpayOrderId: dto.razorpayOrderId, userId },
      data: { razorpayPaymentId: dto.razorpayPaymentId, status: 'PAID' },
    });

    for (const payment of payments) {
      if (payment.type === 'SUBSCRIPTION' && payment.entityId) {
        await this.activateVehicleSubscription(payment.entityId, payment.amount);
        await this.notifySubscriptionActivated(userId, payment.entityId, payment.amount);
      }
    }

    this.logger.log(`Payment verified for user ${userId}, order ${dto.razorpayOrderId}`);
    return { success: true, message: 'Payment verified successfully' };
  }

  // ── Mark Payment Failed (called by client on Razorpay checkout error) ──────
  async markFailed(userId: string, razorpayOrderId: string) {
    await this.prisma.payment.updateMany({
      where: { razorpayOrderId, userId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    this.logger.log(`Payment marked FAILED for order ${razorpayOrderId}`);
    return { success: true };
  }

  // ── Get Payment Status (recovery after app kill) ──────────────────────────
  async getPaymentStatus(userId: string, razorpayOrderId: string) {
    const record = await this.prisma.payment.findFirst({
      where: { razorpayOrderId, userId },
    });

    if (!record) throw new NotFoundException('Payment record not found');

    // If already resolved in DB, return immediately
    if (record.status !== 'PENDING') {
      return { status: record.status, entityId: record.entityId };
    }

    // Query Razorpay directly to see if payment was captured
    if (this.razorpay) {
      try {
        const order = await this.razorpay.orders.fetch(razorpayOrderId);
        if (order.status === 'paid') {
          // Fetch the payment from Razorpay and sync
          const payments = await this.razorpay.orders.fetchPayments(razorpayOrderId);
          const captured = payments?.items?.find((p: any) => p.status === 'captured');
          if (captured) {
            await this.prisma.payment.updateMany({
              where: { razorpayOrderId, userId },
              data: { status: 'PAID', razorpayPaymentId: captured.id },
            });
            if (record.type === 'SUBSCRIPTION' && record.entityId) {
              await this.activateVehicleSubscription(record.entityId, record.amount);
              await this.notifySubscriptionActivated(userId, record.entityId, record.amount);
            }
            return { status: 'PAID', entityId: record.entityId, recovered: true };
          }
        } else if (order.status === 'created' || order.status === 'attempted') {
          return { status: 'PENDING', entityId: record.entityId };
        }
      } catch (err) {
        this.logger.warn(`Razorpay order fetch failed for ${razorpayOrderId}: ${err}`);
      }
    }

    return { status: record.status, entityId: record.entityId };
  }

  // ── Payment History ───────────────────────────────────────────────────────
  async getHistory(userId: string) {
    const records = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      records.map(async (r) => {
        let vehicleInfo = null;
        if (r.type === 'SUBSCRIPTION' && r.entityId) {
          const v = await this.prisma.vehicle.findUnique({
            where: { id: r.entityId },
            select: { type: true, model: true, numberPlate: true },
          });
          if (v) vehicleInfo = { model: v.model, type: v.type, number: v.numberPlate };
        }
        return { ...r, amount: r.amount ? Number(r.amount) : 0, vehicleInfo };
      }),
    );

    return enriched;
  }

  // ── Get Subscription Plans (frontend reads prices from backend) ───────────
  getPlans() {
    return [
      { id: 'monthly', label: 'Monthly', priceRupees: SUBSCRIPTION_PLANS.monthly, daysValid: 30, priceNote: '₹499/month' },
      { id: 'quarterly', label: 'Quarterly', priceRupees: SUBSCRIPTION_PLANS.quarterly, daysValid: 90, priceNote: '₹400/month' },
      { id: 'yearly', label: 'Yearly', priceRupees: SUBSCRIPTION_PLANS.yearly, daysValid: 365, priceNote: '₹333/month' },
    ];
  }

  // ── Webhook Handler ───────────────────────────────────────────────────────
  async handleWebhook(rawBody: string, signature: string) {
    // ✅ FIX #5 / #9 — Graceful error if secret not configured
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('RAZORPAY_WEBHOOK_SECRET not configured — webhook rejected');
      throw new BadRequestException('Webhook secret not configured');
    }

    if (!rawBody) {
      this.logger.error('Webhook received empty raw body — possible middleware issue');
      throw new BadRequestException('Empty webhook body');
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // Timing-safe comparison prevents side-channel attacks on webhook secret
    const sigValid = (() => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'hex'),
          Buffer.from(signature ?? '', 'hex'),
        );
      } catch { return false; }
    })();
    if (!sigValid) {
      this.logger.warn(`Invalid webhook signature from Razorpay`);
      throw new BadRequestException('Invalid signature');
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    this.logger.log(`Received Razorpay Webhook: ${event.event}`);

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      const paymentId = payment.id;

      // ✅ FIX #3 — Idempotency: only process PENDING records
      const pendingPayments = await this.prisma.payment.findMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
      });

      if (pendingPayments.length === 0) {
        this.logger.log(`Webhook for ${orderId}: already processed or not found — skipping`);
        return { status: 'ok', skipped: true };
      }

      await this.prisma.payment.updateMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
        data: { status: 'PAID', razorpayPaymentId: paymentId },
      });

      for (const p of pendingPayments) {
        if (p.type === 'SUBSCRIPTION' && p.entityId) {
          await this.activateVehicleSubscription(p.entityId, p.amount);
          await this.notifySubscriptionActivated(p.userId, p.entityId, p.amount);
        }
      }

      this.logger.log(`Webhook: Payment captured & synced for order ${orderId}`);
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      await this.prisma.payment.updateMany({
        where: { razorpayOrderId: payment.order_id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      this.logger.log(`Webhook: Payment failed for order ${payment.order_id}`);
    }

    return { status: 'ok' };
  }

  // ── Scheduled Cleanup (every 6 hours) ────────────────────────────────────
  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupStalePendingPayments() {
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days
    const result = await this.prisma.payment.deleteMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleanup: deleted ${result.count} stale PENDING payment(s) older than 2 days`);
    }
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async validateSubscriptionAmount(dto: CreatePaymentOrderDto) {
    // Look up what vehicle plan was selected; validate requested amount is correct
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: dto.entityId },
      select: { plan: true },
    });
    if (!vehicle) return; // vehicle not yet created (unlikely but safe)

    const plan = (vehicle.plan || 'monthly') as string;
    const expectedRupees = SUBSCRIPTION_PLANS[plan];
    if (expectedRupees === undefined) return; // unknown plan — skip validation

    const requestedRupees = Math.round(dto.amount / 100);
    if (Math.abs(requestedRupees - expectedRupees) > 1) { // 1 rupee tolerance for rounding
      this.logger.warn(
        `Amount mismatch for ${dto.entityId}: expected ₹${expectedRupees}, got ₹${requestedRupees}`,
      );
      throw new BadRequestException(
        `Invalid amount. Expected ₹${expectedRupees} for ${plan} plan.`,
      );
    }
  }

  private async activateVehicleSubscription(vehicleId: string, amountPaid: any) {
    const amount = Number(amountPaid);
    let daysToAdd = 30;
    if (amount >= 3999) daysToAdd = 365;
    else if (amount >= 1199) daysToAdd = 90;

    const planName = daysToAdd === 365 ? 'yearly' : daysToAdd === 90 ? 'quarterly' : 'monthly';
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysToAdd);

    try {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: { plan: planName, expiryDate },
      });
      this.logger.log(`Vehicle ${vehicleId} subscription: ${planName} until ${expiryDate.toISOString()}`);
    } catch (err) {
      this.logger.warn(`Failed to update vehicle subscription for ${vehicleId}: ${err}`);
    }
  }

  private async notifySubscriptionActivated(userId: string, vehicleId: string, amount: any) {
    try {
      const amountNum = Number(amount);
      const planName = amountNum >= 3999 ? 'Yearly' : amountNum >= 1199 ? 'Quarterly' : 'Monthly';

      await this.prisma.notification.create({
        data: {
          userId,
          title: '✅ Subscription Activated',
          message: `Your ${planName} vehicle subscription is now active. Happy earning!`,
          type: 'SUCCESS',
          link: '/(transporter)/subscriptions',
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to send subscription notification: ${err}`);
    }
  }
}
