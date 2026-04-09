import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

// Firebase Admin is loaded lazily to avoid startup crash if not configured
let admin: any;
try {
  admin = require('firebase-admin');
} catch {
  admin = null;
}

import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private initialized = false;

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2
  ) {
    this.initFirebase();
  }

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50, // Keep it light
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    return this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }

  // Unified method to create a DB notification and optionally fire push push object
  async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CALL_LOG';
    link?: string;
    sendPush?: boolean;
    pushData?: Record<string, string>;
  }) {
    const dbNotification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type || 'INFO',
        link: data.link,
      },
    });

    if (data.sendPush !== false) {
      await this.sendToUser(data.userId, data.title, data.message, data.pushData);
    }

    // Emit event for real-time SSE stream
    this.eventEmitter.emit('notification.created', dbNotification);

    return dbNotification;
  }

  private initFirebase() {
    if (!admin) {
      this.logger.warn(
        'firebase-admin not installed — push notifications disabled',
      );
      return;
    }
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT env not set — push notifications disabled',
      );
      return;
    }
    if (admin.apps.length === 0) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
        });
        this.initialized = true;
        this.logger.log('Firebase Admin initialized');
      } catch (e: any) {
        this.logger.error(`Firebase init failed: ${e.message}`);
      }
    } else {
      this.initialized = true;
    }
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!this.initialized) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if (!user?.fcmToken) {
      this.logger.debug(`No FCM token for user ${userId}`);
      return;
    }

    try {
      await admin.messaging().send({
        token: user.fcmToken,
        notification: { title, body },
        data: data ?? {},
      });
      this.logger.log(`FCM sent to user ${userId}: ${title}`);
    } catch (e: any) {
      this.logger.error(`FCM send failed for user ${userId}: ${e.message}`);
    }
  }
}
