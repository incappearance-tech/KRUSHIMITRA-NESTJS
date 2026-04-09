import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('notifications-queue')
export class NotificationWorker extends WorkerHost {
    private readonly logger = new Logger(NotificationWorker.name);

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing notification job: ${job.id} for type ${job.name}`);

        try {
            // Simulate heavy notification sending (FCM/SMS/Email)
            await new Promise((resolve) => setTimeout(resolve, 500));

            switch (job.name) {
                case 'push':
                    this.logger.debug(`Sending push to ${job.data.userId}`);
                    break;
                case 'sms':
                    this.logger.debug(`Sending SMS to ${job.data.phone}`);
                    break;
                default:
                    this.logger.warn(`Unknown job name: ${job.name}`);
            }

            this.logger.log(`Completed notification job: ${job.id}`);
            return { success: true };
        } catch (error) {
            this.logger.error(`Failed notification job: ${job.id}`, error);
            throw error;
        }
    }
}
