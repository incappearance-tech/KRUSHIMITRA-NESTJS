import { Controller, Get, Patch, Delete, Param, UseGuards, Sse, Logger, Header, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';
import { JwtService } from '@nestjs/jwt';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
    private readonly logger = new Logger(NotificationsController.name);
    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly jwtService: JwtService,
    ) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all user notifications' })
    async getUserNotifications(@GetUser('id') userId: string) {
        return this.notificationsService.getUserNotifications(userId);
    }

    @Sse('stream')
    @Header('Content-Type', 'text/event-stream')
    @Header('Cache-Control', 'no-cache')
    @Header('Connection', 'keep-alive')
    @ApiOperation({ summary: 'Real-time notification stream (SSE)' })
    stream(@Req() req: any, @Query('token') queryToken?: string) {
        // Manual token extraction — guards interfere with NestJS SSE lifecycle
        const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string;
        const rawToken = authHeader?.replace('Bearer ', '').trim() || queryToken;

        if (!rawToken) {
            this.logger.warn('SSE: No token provided');
            throw new Error('Unauthorized');
        }

        let userId: string;
        try {
            const payload = this.jwtService.verify(rawToken) as any;
            userId = payload.sub || payload.id || payload.userId;
        } catch (e) {
            this.logger.warn(`SSE: Invalid token - ${e.message}`);
            throw new Error('Unauthorized');
        }

        this.logger.log(`📱 [SSE] Real-time stream connected for user: ${userId}`);
        return this.notificationsService.streamNotifications(userId);
    }

    @Get('unread-count')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get unread notification count' })
    async getUnreadCount(@GetUser('id') userId: string) {
        return this.notificationsService.getUnreadCount(userId);
    }

    @Patch('read-all')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Mark all notifications as read' })
    async markAllAsRead(@GetUser('id') userId: string) {
        return this.notificationsService.markAllAsRead(userId);
    }

    @Patch(':id/read')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Mark single notification as read' })
    async markAsRead(
        @GetUser('id') userId: string,
        @Param('id') notificationId: string,
    ) {
        return this.notificationsService.markAsRead(userId, notificationId);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Delete a single notification' })
    async deleteNotification(
        @GetUser('id') userId: string,
        @Param('id') notificationId: string,
    ) {
        return this.notificationsService.deleteNotification(userId, notificationId);
    }
}
