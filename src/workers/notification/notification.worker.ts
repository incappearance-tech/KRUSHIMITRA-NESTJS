import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../../common/notifications/notifications.service';

@Processor('notifications-queue')
export class NotificationWorker extends WorkerHost {
    private readonly logger = new Logger(NotificationWorker.name);

    constructor(private readonly notificationsService: NotificationsService) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing notification job=${job.id} type=${job.name}`);

        try {
            switch (job.name) {
                case 'push':
                    await this.notificationsService.createNotification({
                        userId: job.data.userId,
                        title: job.data.title,
                        message: job.data.body,
                        type: job.data.type || 'INFO',
                        link: job.data.link,
                        sendPush: true,
                        pushData: job.data.pushData,
                    });
                    break;

                case 'sms':
                    // SMS provider integration (Exotel/Twilio) goes here
                    this.logger.debug(`SMS queued for ${job.data.phone}`);
                    break;

                default:
                    this.logger.warn(`Unknown notification job type: ${job.name}`);
            }

            return { success: true };
        } catch (error) {
            this.logger.error(`Failed notification job=${job.id}`, error);
            throw error;
        }
    }
}
