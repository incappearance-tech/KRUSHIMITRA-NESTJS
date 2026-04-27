import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ClassSerializerInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { NestFactory, Reflector } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import compression from '@fastify/compress';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import rawBody from 'fastify-raw-body';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  // 0. High-Performance Logging
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  // rawBody MUST be registered before multipart — Razorpay webhook HMAC verification
  // reads req.rawBody. If this runs after multipart, the body stream is already consumed.
  await app.register(rawBody as any, {
    global: true,     // expose rawBody on every request
    encoding: 'utf8', // webhook payload is UTF-8 JSON string
    runFirst: true,   // parse before any other body parser
  });

  // Multipart handling for Fastify (Replaces Multer)
  await app.register(require('@fastify/multipart'), {
    limits: {
      fieldNameSize: 100, // Max field name size in bytes
      fieldSize: 1000000, // Max field value size in bytes (1MB)
      fields: 10,         // Max number of non-file fields
      fileSize: 10485760, // Max file size in bytes (10MB)
      files: 1,           // Max number of file fields
    }
  });

  // 1. Global Security Headers (Helmet for Fastify)
  await app.register(helmet as any);

  // 2. Response Compression via Fastify plugin
  await app.register(compression as any, {
    encodings: ['gzip', 'deflate'],
  });

  // 3. Global Serialization (Prunes @Exclude properties)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // 4. Global Interceptors & Filters (Mobile-First Architecture)
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Set global API prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe for all requests
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 5. Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('KrushiMitra API')
    .setDescription('The KrushiMitra Mobile API description')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer('http://localhost:3000', 'Local Environment')
    .addServer('https://krushimitra-api.onrender.com', 'Production Environment')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // Enable CORS for mobile app access
  app.enableCors({
    origin: '*', // Allow all origins for mobile app development
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  const appLogger = app.get(Logger);
  appLogger.log(
    `🚀 Krushimitra Mobile API running on: http://0.0.0.0:${port}/api/v1`,
  );
  appLogger.log(`📱 Optimized for Android & iOS with FASTIFY engine`);
  appLogger.log(`⚡ Compression enabled - 70% smaller responses`);
}
bootstrap();
