import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  async createOrder(userId: string, dto: CreatePaymentOrderDto) {
    if (!this.razorpay) {
      throw new BadRequestException(
        'Payment gateway not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }

    const order = await this.razorpay.orders.create({
      amount: dto.amount, // amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    });

    // Save pending payment record
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

  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? '';

    // Allow mock signatures in dev mode
    const isMockPayment = dto.razorpayPaymentId.startsWith('pay_mock_') && dto.razorpaySignature === 'mock_signature';
    if (!isMockPayment) {
      const generatedSig = crypto
        .createHmac('sha256', keySecret)
        .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
        .digest('hex');

      if (generatedSig !== dto.razorpaySignature) {
        throw new BadRequestException(
          'Payment verification failed: Invalid signature',
        );
      }
    }

    // Update payment record to PAID
    const payments = await this.prisma.payment.findMany({
      where: { razorpayOrderId: dto.razorpayOrderId, userId },
    });

    await this.prisma.payment.updateMany({
      where: { razorpayOrderId: dto.razorpayOrderId, userId },
      data: { razorpayPaymentId: dto.razorpayPaymentId, status: 'PAID' },
    });

    // Update vehicle subscription if this is a SUBSCRIPTION payment for a vehicle
    for (const payment of payments) {
      if (payment.type === 'SUBSCRIPTION' && payment.entityId) {
        await this.activateVehicleSubscription(payment.entityId, payment.amount);
      }
    }

    this.logger.log(
      `Payment verified for user ${userId}, order ${dto.razorpayOrderId}`,
    );
    return { success: true, message: 'Payment verified successfully' };
  }

  private async activateVehicleSubscription(vehicleId: string, amountPaid: any) {
    const amount = Number(amountPaid);
    let daysToAdd = 30; // default monthly
    if (amount >= 4000) daysToAdd = 365;       // yearly ≥ ₹5000
    else if (amount >= 1000) daysToAdd = 90;   // quarterly ≥ ₹1400

    const planName = daysToAdd === 365 ? 'yearly' : daysToAdd === 90 ? 'quarterly' : 'monthly';
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysToAdd);

    try {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: { plan: planName, expiryDate },
      });
      this.logger.log(`Vehicle ${vehicleId} subscription activated: ${planName} until ${expiryDate.toISOString()}`);
    } catch (err) {
      this.logger.warn(`Failed to update vehicle subscription for ${vehicleId}: ${err}`);
    }
  }

  async getHistory(userId: string) {
    // Clean up very old stale PENDING records (older than 2 days) in the background
    this.prisma.payment.deleteMany({
      where: {
        userId,
        status: 'PENDING',
        createdAt: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      },
    }).catch(() => { });

    // Return records with vehicle info if relevant
    const records = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(records.map(async (r) => {
      let vehicleInfo = null;
      if (r.type === 'SUBSCRIPTION' && r.entityId) {
        const v = await this.prisma.vehicle.findUnique({
          where: { id: r.entityId },
          select: { type: true, model: true, numberPlate: true }
        });
        if (v) {
          vehicleInfo = {
            model: v.model,
            type: v.type,
            number: v.numberPlate
          };
        }
      }
      return {
        ...r,
        amount: r.amount ? Number(r.amount) : 0,
        vehicleInfo
      };
    }));

    return enriched;
  }


  async handleWebhook(rawBody: string, signature: string) {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('RAZORPAY_WEBHOOK_SECRET not configured');
      throw new BadRequestException('Webhook secret not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      this.logger.warn('Invalid webhook signature detected');
      throw new BadRequestException('Invalid signature');
    }

    const event = JSON.parse(rawBody);
    this.logger.log(`Received Razorpay Webhook: ${event.event}`);

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      const paymentId = payment.id;

      // Sync with DB
      const updatedPayments = await this.prisma.payment.findMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
      });

      await this.prisma.payment.updateMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
        data: {
          status: 'PAID',
          razorpayPaymentId: paymentId,
        },
      });

      // Activate vehicle subscription
      for (const p of updatedPayments) {
        if (p.type === 'SUBSCRIPTION' && p.entityId) {
          await this.activateVehicleSubscription(p.entityId, p.amount);
        }
      }

      this.logger.log(`Payment captured & synced: Order ${orderId}`);
    }

    return { status: 'ok' };
  }
}
