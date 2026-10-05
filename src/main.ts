import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global Pipes para validación estricta de DTOs y seguridad
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Habilitar CORS para consumo mobile y frontend desacoplado
  app.enableCors();

  // Configuración de Documentación Swagger UI
  const config = new DocumentBuilder()
    .setTitle('WMS / ERP dsh-logistica API')
    .setDescription(
      'Documentación interactiva de la API REST para el sistema de logística, inventario, picking y hojas de ruta.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const PORT = process.env.PORT || 3000;
  await app.listen(PORT);
  console.log(`🚀 Servidor WMS corriendo en: http://localhost:${PORT}`);
  console.log(`📚 Documentación Swagger en: http://localhost:${PORT}/api/docs`);
}
bootstrap();
