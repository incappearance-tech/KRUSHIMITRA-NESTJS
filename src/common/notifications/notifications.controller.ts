import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

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
}
