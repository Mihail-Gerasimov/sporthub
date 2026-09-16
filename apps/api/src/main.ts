// Точка входа бэкенда. Порт настраивается через API_PORT, дефолт 3001:
// 3000 занят Next-приложением, они поднимаются рядом.
import 'reflect-metadata';

import path from 'node:path';

import { NestFactory } from '@nestjs/core';
import { BRAND_NAME } from '@sporthub/domain';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configureApp } from './configure-app';

/**
 * Переменные окружения из `.env` рядом с пакетом. Ключи карт живут здесь:
 * прокси адресов переехало на бэкенд, и наружу ключи не уходят.
 * Отсутствие файла — не ошибка: на сервере переменные может задавать pm2.
 */
function loadEnvironment(): void {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch {
    // Файла нет — работаем на том, что уже в окружении.
  }
}

async function bootstrap(): Promise<void> {
  loadEnvironment();

  const app = configureApp(
    await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true }),
  );
  const port = Number(process.env.API_PORT ?? 3001);

  await app.listen(port);
  console.log(`[api] ${BRAND_NAME}: бэкенд слушает порт ${port}`);
}

void bootstrap();
