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
  const isProduction = process.env.NODE_ENV === 'production';

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    // 100% in dev to catch everything; 10% in production to reduce cost + noise
    tracesSampleRate:   isProduction ? 0.1 : 1.0,
    profilesSampleRate: isProduction ? 0.1 : 1.0,
    environment: process.env.NODE_ENV ?? 'development',
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  // 0. High-Performance Logging
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);


  // rawBody is needed ONLY for the Razorpay webhook — HMAC verification requires the
  // raw unparsed body string. Setting global:false + routes whitelist ensures rawBody
  // is only collected for that one endpoint.
  //
  // ⚠️  Do NOT set global:true — rawBody with runFirst:true consumes the entire body
  //     stream before @fastify/multipart can parse it, causing req.file() to return
  //     undefined and the "No file provided" error on /upload routes.
  await app.register(rawBody as any, {
    global: false,    // opt-in only — don't consume body on every route
    encoding: 'utf8',   // webhook payload is UTF-8 JSON string
    runFirst: true,     // capture before any preParsing hook modifies the stream
    routes: ['/api/v1/payments/webhook'],  // whitelist: ONLY the webhook needs rawBody
  });

  // Multipart handling for Fastify (replaces Multer)
  await app.register(require('@fastify/multipart'), {
    limits: {
      fieldNameSize: 100,       // Max field name size in bytes
      fieldSize: 1_000_000, // Max field value size (1 MB)
      fields: 10,        // Max non-file fields
      fileSize: 10_485_760,// Max file size (10 MB)
      files: 1,         // Max file fields per request
    },
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

  // 5. Swagger — only in non-production (exposes full API schema to attackers)
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('KrushiMitra API')
      .setDescription('The KrushiMitra Mobile API description')
      .setVersion('1.0')
      .addBearerAuth()
      .addServer('http://localhost:3000', 'Local Environment')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
  }

  // 6. CORS — restrict to known origins in production
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
  app.enableCors({
    origin: isProduction
      ? (allowedOrigins.length ? allowedOrigins : false) // false = block all browser origins in prod (mobile only)
      : '*',                                              // dev: allow all
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,x-timestamp,x-nonce,x-signature,x-encrypted,x-encryption-type,x-instance-id',
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
