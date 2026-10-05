import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Configurar el prefijo global '/api' para todos los endpoints
  app.setGlobalPrefix('api');

  // 2. Habilitar CORS para permitir peticiones desde el frontend (Next.js)
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  // 3. Configurar pipes de validación global (clase-validator / DTOs)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 4. Configurar Swagger para la documentación
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

  // 5. Iniciar el servidor en el puerto 3001
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Backend corriendo en: http://localhost:${port}/api`);
  console.log(`📚 Documentación Swagger en: http://localhost:${port}/api/docs`);
}

bootstrap();
