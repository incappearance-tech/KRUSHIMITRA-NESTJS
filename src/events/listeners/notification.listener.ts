import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsService } from '../../common/notifications/notifications.service';
import {
    TransportRequestCreatedEvent,
    BookingStatusUpdatedEvent,
    UserRegisteredEvent,
} from '../types/system.events';

@Injectable()
export class NotificationListener {
    private readonly logger = new Logger(NotificationListener.name);

    constructor(
        @InjectQueue('notifications-queue') private notificationsQueue: Queue,
        private readonly notificationsService: NotificationsService,
    ) { }

    @OnEvent('transport.request.created', { async: true })
    async handleTransportRequestCreated(event: TransportRequestCreatedEvent) {
        this.logger.log(`Handling transport.request.created for request=${event.requestId} transporter=${event.transporterUserId}`);
        await this.notificationsService.createNotification({
            userId: event.transporterUserId,
            title: 'नई गाडी की मांग आई है!',
            message: 'एक किसान ने आपकी गाडी मांगी है। देखने के लिए टैप करें।',
            type: 'INFO',
            link: `/transporter/requests/${event.requestId}`,
            sendPush: true,
            pushData: {
                requestId: event.requestId,
                type: 'TRANSPORT_REQUEST',
            },
        });
    }

    @OnEvent('booking.status.updated', { async: true })
    async handleBookingStatusUpdate(event: BookingStatusUpdatedEvent) {
        this.logger.log(`Handling booking.status.updated for booking=${event.bookingId}`);
        await this.notificationsQueue.add('push', {
            userId: event.targetUserId,
            title: 'Booking Update',
            body: `Your booking was ${event.status}.`,
            type: 'INFO',
            bookingId: event.bookingId,
        });
    }

    @OnEvent('user.registered', { async: true })
    async handleUserRegistration(event: UserRegisteredEvent) {
        this.logger.log(`Handling user.registered for userId=${event.userId}`);
        await this.notificationsQueue.add('sms', {
            phone: event.phone,
            message: `KrushiMitra में आपका स्वागत है! आपने ${event.role} के रूप में पंजीकरण किया है।`,
        });
    }
}
