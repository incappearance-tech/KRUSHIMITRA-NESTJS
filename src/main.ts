import { ValidationPipe, Logger, ClassSerializerInterceptor } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';

import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // 1. Global Security Headers (Helmet)
  app.use(helmet());

  // 2. Response Compression (Reduces payload size by ~70%)
  app.use(compression({
    filter: (req: any, res: any) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6, // Balance between speed and compression
  }));

  // 3. Global Serialization (Prunes @Exclude properties)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // 4. Global Interceptors & Filters (Mobile-First Architecture)
  // app.useGlobalInterceptors(new ResponseInterceptor(configService)); // Removed duplicate
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

  // Enable CORS for mobile app access
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Krushimitra Mobile API running on: http://localhost:${port}/api/v1`);
  logger.log(`📱 Optimized for Android & iOS`);
  logger.log(`⚡ Compression enabled - 70% smaller responses`);
}
// Force Restart Trigger 6
bootstrap();
