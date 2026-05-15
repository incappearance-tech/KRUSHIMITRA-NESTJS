import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * Payment Worker — handles async side-effects after payment events.
 *
 * Job types:
 *  - send-subscription-notification  Notify user their subscription is active
 *  - send-expiry-notification         Notify user their subscription expires soon
 *  - retry-webhook                    Re-process a failed Razorpay webhook event
 */
@Processor('payments-queue')
export class PaymentWorker extends WorkerHost {
  private readonly logger = new Logger(PaymentWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job [${job.name}] id=${job.id}`);

    switch (job.name) {
      case 'send-subscription-notification':
        return this.handleSubscriptionNotification(job.data);

      case 'send-expiry-notification':
        return this.handleExpiryNotification(job.data);

      case 'retry-webhook':
        return this.handleWebhookRetry(job.data);

      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return { skipped: true };
    }
  }

  // ── Notify user: subscription activated ────────────────────────────────────
  private async handleSubscriptionNotification(data: {
    userId:    string;
    vehicleId: string;
    amount:    number;
  }) {
    const planName =
      data.amount === 0   ? 'Free Trial' :
      data.amount >= 3999 ? 'Yearly'     :
      data.amount >= 1199 ? '3 Months'   : 'Monthly';

    try {
      await this.prisma.notification.create({
        data: {
          userId:  data.userId,
          title:   '✅ Subscription Activated',
          message: `Your ${planName} vehicle subscription is now active. Happy earning!`,
          type:    'SUCCESS',
          link:    '/(transporter)/subscriptions',
        },
      });
      this.logger.log(`Subscription notification sent: user=${data.userId}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to create subscription notification: ${err.message}`);
      throw err; // re-throw so BullMQ retries
    }
  }

  // ── Notify user: subscription expiring soon ─────────────────────────────────
  private async handleExpiryNotification(data: {
    userId:    string;
    vehicleId: string;
    daysLeft:  number;
    plan:      string;
  }) {
    const label = data.plan.charAt(0).toUpperCase() + data.plan.slice(1);
    try {
      await this.prisma.notification.create({
        data: {
          userId:  data.userId,
          title:   '⚠️ Subscription Expiring Soon',
          message: `Your ${label} vehicle subscription expires in ${data.daysLeft} day(s). Renew now to keep earning!`,
          type:    'WARNING',
          link:    '/(transporter)/subscriptions',
        },
      });
      this.logger.log(`Expiry notification sent: user=${data.userId} daysLeft=${data.daysLeft}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to create expiry notification: ${err.message}`);
      throw err;
    }
  }

  // ── Retry a failed webhook event ─────────────────────────────────────────────
  private async handleWebhookRetry(data: {
    webhookLogId: string;
    event:        string;
  }) {
    const log = await this.prisma.webhookLog.findUnique({
      where: { id: data.webhookLogId },
    });

    if (!log) {
      this.logger.warn(`WebhookLog ${data.webhookLogId} not found — skip retry`);
      return { skipped: true };
    }

    if (log.processed) {
      this.logger.log(`WebhookLog ${data.webhookLogId} already processed — skip retry`);
      return { skipped: true };
    }

    // Mark as needing manual review — prevents infinite retry loops.
    // A proper retry would require injecting PaymentsService, which creates a
    // circular module dependency. For failed webhooks, ops should use the
    // Razorpay dashboard to replay the event directly.
    await this.prisma.webhookLog.update({
      where: { id: data.webhookLogId },
      data:  {
        errorMsg: `Queued for manual review after retry exhaustion. Event: ${data.event}. ` +
                  `Replay via Razorpay dashboard → Webhooks → Retry.`,
      },
    });

    return { requiresManualReview: true, webhookLogId: data.webhookLogId };
  }
}
