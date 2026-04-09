import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationWorker } from './notification.worker';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'notifications-queue',
        }),
    ],
    providers: [NotificationWorker],
    exports: [BullModule],
})
export class NotificationWorkerModule { }
