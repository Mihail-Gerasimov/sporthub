// Настройки Prisma для миграций.
//
// Начиная с Prisma 7 строка подключения в схеме не хранится: миграции берут её отсюда,
// а сам клиент получает соединение через драйвер-адаптер. Разделение не формальность —
// оно позволяет задать размер пула явной настройкой (`storage/prisma.service.ts`),
// а не спрятанным хвостом строки подключения.

import path from 'node:path';

import { defineConfig } from 'prisma/config';

// Переменные окружения читает сам процесс: у бэкенда это `apps/api/.env`,
// в контейнере — окружение сервиса.
process.loadEnvFile?.(path.join(__dirname, '.env'));

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
