import { Controller, Get, Patch, Delete, Param, UseGuards, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';
import { Observable, interval, fromEvent, map, filter, merge } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly notificationsService: NotificationsService,
        private eventEmitter: EventEmitter2
    ) { }

    @Sse('stream')
    @ApiOperation({ summary: 'Real-time notification stream (SSE)' })
    stream(@GetUser('id') userId: string): Observable<MessageEvent> {
        this.notificationsService.getUserNotifications(userId); // Just to verify user

        // 1. Initial connection message
        const initialEvent = new Observable<MessageEvent>(subscriber => {
            subscriber.next({
                data: { connected: true, message: 'Connected to Notifications Stream' }
            } as MessageEvent);
            subscriber.complete();
        });

        // 2. Heartbeat every 30 seconds to keep connection alive
        const heartbeat = interval(30000).pipe(
            map(() => ({ data: { heartbeat: true } } as MessageEvent))
        );

        // 3. Real-time events from EventEmitter
        const eventStream = fromEvent(this.eventEmitter, 'notification.created').pipe(
            filter((notification: any) => notification.userId === userId),
            map((notification: any) => ({
                data: notification
            } as MessageEvent))
        );

        return merge(initialEvent, heartbeat, eventStream);
    }

    @Get()
    @ApiOperation({ summary: 'Get all user notifications' })
    async getUserNotifications(@GetUser('id') userId: string) {
        return this.notificationsService.getUserNotifications(userId);
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Get unread notification count' })
    async getUnreadCount(@GetUser('id') userId: string) {
        return this.notificationsService.getUnreadCount(userId);
    }

    @Patch('read-all')
    @ApiOperation({ summary: 'Mark all notifications as read' })
    async markAllAsRead(@GetUser('id') userId: string) {
        return this.notificationsService.markAllAsRead(userId);
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Mark single notification as read' })
    async markAsRead(
        @GetUser('id') userId: string,
        @Param('id') notificationId: string,
    ) {
        return this.notificationsService.markAsRead(userId, notificationId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a single notification' })
    async deleteNotification(
        @GetUser('id') userId: string,
        @Param('id') notificationId: string,
    ) {
        return this.notificationsService.deleteNotification(userId, notificationId);
    }
}
