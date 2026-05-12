import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { RedisModule } from './database/redis/redis.module';
import { CommonModule } from './common/common.module';
import { MachinesModule } from './modules/machines/machines.module';
import { LabourModule } from './modules/labour/labour.module';
import { TransporterModule } from './modules/transporter/transporter.module';
import { NurseryModule } from './modules/nursery/nursery.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CallsModule } from './modules/calls/calls.module';
import { NotificationsModule } from './common/notifications/notifications.module';
import { DecryptionMiddleware } from './common/middleware/decryption.middleware';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { TimestampMiddleware } from './common/middleware/timestamp.middleware';
import { SignatureMiddleware } from './common/middleware/signature.middleware';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { UploadModule } from './modules/upload/upload.module';
import { LocationModule } from './modules/location/location.module';
import { NotificationWorkerModule } from './workers/notification/notification.worker.module';
import { PaymentWorkerModule } from './workers/payment/payment.worker.module';
import { ImageWorkerModule } from './workers/image/image.worker.module';
import { ReportWorkerModule } from './workers/report/report.worker.module';
import { EventsModule } from './events/events.module';
import { SecurityGuard } from './common/guards/security.guard';
import { AppLoggerModule } from './common/logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const store = await redisStore({
          socket: {
            host: configService.get('REDIS_HOST'),
            port: parseInt(configService.get('REDIS_PORT') || '6379'),
            tls: configService.get('REDIS_HOST') !== 'localhost',
            reconnectStrategy: (retries) => {
              // Exponential backoff with a cap at 3 seconds
              return Math.min(retries * 100, 3000);
            },
            keepAlive: 10000,
          },
          password: configService.get('REDIS_PASSWORD'),
          ttl: 60 * 1000,
        });

        // Prevention of unhandled 'error' events which crash the process
        if (store.client) {
          store.client.on('error', (err: any) => {
            if (err?.code === 'ECONNRESET') {
              console.warn('Redis Cache Connection Reset (ECONNRESET) - Reconnecting...');
              return;
            }
            console.error('Redis Cache Client Error:', err);
          });
        }

        return { store };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{
          ttl: 60000,
          limit: 100,
        }],
        storage: new ThrottlerStorageRedisService(
          new Redis({
            host: config.get('REDIS_HOST'),
            port: parseInt(config.get('REDIS_PORT') || '6379'),
            password: config.get('REDIS_PASSWORD'),
            ...(config.get('REDIS_HOST') !== 'localhost' && {
              tls: { servername: config.get('REDIS_HOST') }
            }),
          })
        ),
      }),
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
          ...(configService.get('REDIS_HOST') !== 'localhost' && {
            tls: {
              servername: configService.get('REDIS_HOST'),
            },
          }),
          maxRetriesPerRequest: null, // Critical for BullMQ
          enableReadyCheck: false,
          keepAlive: 10000,
          reconnectOnError: (err) => {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) return true;
            return false;
          },
        },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    PrismaModule,
    RedisModule,
    CommonModule,
    MachinesModule,
    LabourModule,
    TransporterModule,
    NurseryModule,
    PaymentsModule,
    CallsModule,
    NotificationsModule,
    UploadModule,
    LocationModule,
    NotificationWorkerModule,
    PaymentWorkerModule,
    ImageWorkerModule,
    ReportWorkerModule,
    EventsModule,
    AppLoggerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SecurityGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('(.*)');
  }
}
