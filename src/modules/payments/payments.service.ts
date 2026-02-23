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
    const generatedSig = crypto
      .createHmac('sha256', keySecret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    if (generatedSig !== dto.razorpaySignature) {
      throw new BadRequestException(
        'Payment verification failed: Invalid signature',
      );
    }

    // Update payment record to PAID
    await this.prisma.payment.updateMany({
      where: { razorpayOrderId: dto.razorpayOrderId, userId },
      data: { razorpayPaymentId: dto.razorpayPaymentId, status: 'PAID' },
    });

    this.logger.log(
      `Payment verified for user ${userId}, order ${dto.razorpayOrderId}`,
    );
    return { success: true, message: 'Payment verified successfully' };
  }

  async getHistory(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
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
      await this.prisma.payment.updateMany({
        where: { razorpayOrderId: orderId, status: 'PENDING' },
        data: {
          status: 'PAID',
          razorpayPaymentId: paymentId,
        },
      });

      this.logger.log(`Payment captured & synced: Order ${orderId}`);
    }

    return { status: 'ok' };
  }
}
