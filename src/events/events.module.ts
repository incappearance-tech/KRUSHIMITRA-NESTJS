import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationListener } from './listeners/notification.listener';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'notifications-queue',
        }),
    ],
    providers: [NotificationListener],
})
export class EventsModule { }
