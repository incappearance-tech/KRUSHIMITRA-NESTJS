import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Subject, filter, map, merge, interval, timer } from 'rxjs';
import { RedisService } from '../../database/redis/redis.service';
import Redis from 'ioredis';

// Firebase Admin is loaded lazily to avoid startup crash if not configured
let admin: any;
try {
  admin = require('firebase-admin');
} catch {
  admin = null;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private initialized = false;
  private readonly notificationSubject = new Subject<any>();
  private subscriber: Redis;

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {
    this.initFirebase();
  }

  async onModuleInit() {
    this.setupRedisSubscriber();
  }

  private setupRedisSubscriber() {
    // Create a dedicated subscriber client (ioredis requires a separate client for blocking sub)
    this.subscriber = this.redisService.client.duplicate();

    this.subscriber.subscribe('notifications');

    this.subscriber.on('message', (channel, message) => {
      if (channel === 'notifications') {
        try {
          const notification = JSON.parse(message);
          this.notificationSubject.next(notification);
        } catch (e) {
          this.logger.error('Failed to parse Redis notification message', e);
        }
      }
    });

    this.logger.log('Redis Sub: Listening for notifications across instances');
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

    // 1. Push to cross-instance stream via Redis
    this.logger.log(`Emitting notification for user: ${data.userId}`);
    this.redisService.client.publish('notifications', JSON.stringify(dbNotification));

    // 2. Also emit to local subject for immediate delivery on the SAME instance
    this.notificationSubject.next(dbNotification);

    if (data.sendPush !== false) {
      // Background task - don't block the API response
      this.sendToUser(data.userId, data.title, data.message, data.pushData);
    }

    return dbNotification;
  }

  // SSE Stream for a specific user
  streamNotifications(userId: string) {
    // 1. Initial connection event so the client knows it's live
    const init$ = timer(0).pipe(
      map(() => ({ data: { connected: true, message: 'Real-time notifications active' } })),
    );

    const notifications$ = this.notificationSubject.asObservable().pipe(
      filter((notification) => notification.userId === userId),
      map((notification) => ({ data: notification })),
    );

    // Add a heartbeat every 20 seconds to keep the connection alive in production (Render/Cloudflare/Nginx)
    const heartbeat$ = interval(20000).pipe(
      map(() => ({ data: { heartbeat: true } })),
    );

    // Start with the init event, then merge others
    return merge(init$, notifications$, heartbeat$);
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
      this.logger.warn(`Skipping push: No FCM token for user ${userId}. Make sure the device is registered.`);
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
