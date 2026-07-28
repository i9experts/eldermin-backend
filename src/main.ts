import * as dotenv from 'dotenv';
dotenv.config();

import { initSentry } from './instrument';
initSentry();

import { webcrypto } from 'crypto';
if (!(global as any).crypto) { (global as any).crypto = webcrypto; }

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './filters/sentry.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'https://eldermin.com',
      'https://www.eldermin.com',
      'https://app.eldermin.com',
      'https://api.eldermin.com',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-school-slug', 'x-academic-year'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new SentryExceptionFilter());

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Eldermin backend running on port ${port}`);
  console.log(`MongoDB: ${process.env.MONGODB_URI}`);
}
bootstrap();
