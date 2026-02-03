import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Global Interceptors & Filters (Mobile-First Architecture)
  app.useGlobalInterceptors(new ResponseInterceptor(configService));
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Set global API prefix (Must be before Swagger)
  app.setGlobalPrefix('api/v1');

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Krushimitra API')
    .setDescription('The Krushimitra Backend API Documentation')
    .setVersion('1.0')
    .addBearerAuth() // Allows passing JWT in Swagger
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

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
  console.log(`🚀 Krushimitra Backend running on: http://localhost:${port}/api/v1`);
}
bootstrap();
