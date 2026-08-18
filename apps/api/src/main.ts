// Точка входа бэкенда. Порт настраивается через API_PORT, дефолт 3001:
// 3000 занят Next-приложением, они поднимаются рядом.
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.API_PORT ?? 3001);

  await app.listen(port);
  console.log(`[api] SportHub backend слушает порт ${port}`);
}

void bootstrap();
