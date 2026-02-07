import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { RedisModule } from './database/redis/redis.module';
import { CommonModule } from './common/common.module';
import { MachinesModule } from './modules/machines/machines.module';
import { LabourModule } from './modules/labour/labour.module';
import { TransporterModule } from './modules/transporter/transporter.module';
import { DecryptionMiddleware } from './common/middleware/decryption.middleware';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { TimestampMiddleware } from './common/middleware/timestamp.middleware';
import { SignatureMiddleware } from './common/middleware/signature.middleware';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100, // 100 requests per minute per IP
      },
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
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
      .apply(
        LoggerMiddleware,        // Log all requests
        TimestampMiddleware,     // Validate timestamp & nonce (anti-replay)
        SignatureMiddleware,     // Verify HMAC signature FIRST (of Encrypted Payload) - Authenticate then Decrypt pattern
        DecryptionMiddleware     // Then Decrypt payload
      )
      .forRoutes('*');
  }
}
