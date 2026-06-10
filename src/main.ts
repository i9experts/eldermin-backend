import { webcrypto } from 'crypto';
(global as any).crypto = webcrypto;

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://93.127.163.238:5173',
      'http://93.127.163.238:5174',
      'http://93.127.163.238:5175',
      'http://93.127.163.238:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Eldermin backend running on port ${port}`);
  console.log(`MongoDB: ${process.env.MONGODB_URI}`);
}
bootstrap();
