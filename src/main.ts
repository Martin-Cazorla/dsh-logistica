// dsh-logistica/src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module';
import { getAllowedOrigins } from './common/cors';

/**
 * Carga .env de forma nativa (Node >= 20.12). Antes, JWT_SECRET nunca llegaba
 * a process.env y el backend firmaba tokens con el secreto hardcodeado.
 */
function loadEnv() {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

async function bootstrap() {
  loadEnv();

  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // 1. Prefijo global '/api' para todos los endpoints HTTP
  app.setGlobalPrefix('api');

  // 2. CORS restringido a los orígenes configurados (CORS_ORIGINS)
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  // 3. Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 4. Cierre ordenado (libera conexiones Prisma y sockets)
  app.enableShutdownHooks();

  // 5. Swagger sólo fuera de producción
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('DSH Logística - WMS / ERP API')
      .setDescription(
        'Documentación de la API para el sistema de gestión logística',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Backend corriendo en: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`Documentación Swagger en: http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
