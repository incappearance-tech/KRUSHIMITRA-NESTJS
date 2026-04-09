import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
    ) { }

    @OnEvent('transport.request.created', { async: true })
    async handleTransportRequestCreated(event: TransportRequestCreatedEvent) {
        this.logger.log(`Received transport.request.created event for ${event.requestId}`);
        // Non-blocking handoff to Redis queue
        await this.notificationsQueue.add('push', {
            userId: event.vehicleId, // In reality, fetch transporter's device token
            title: 'New Transport Request!',
            body: `A farmer requested a vehicle for a ${event.distanceKm}km trip.`,
            requestId: event.requestId,
        });
    }

    @OnEvent('booking.status.updated', { async: true })
    async handleBookingStatusUpdate(event: BookingStatusUpdatedEvent) {
        this.logger.log(`Received booking.status.updated event for ${event.bookingId}`);

        await this.notificationsQueue.add('push', {
            userId: event.targetUserId,
            title: 'Booking Update',
            body: `Your booking was ${event.status}.`,
            bookingId: event.bookingId,
        });
    }

    @OnEvent('user.registered', { async: true })
    async handleUserRegistration(event: UserRegisteredEvent) {
        this.logger.log(`Received user.registered event for ${event.userId}`);
        // Trigger Welcome SMS via queue instead of blocking API
        await this.notificationsQueue.add('sms', {
            phone: event.phone,
            message: `Welcome to KrushiMitra! You have registered as a ${event.role}.`,
        });
    }
}
