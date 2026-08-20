// Соединение с базой: клиент Prisma поверх драйвера PostgreSQL.
//
// Клиент собирается вручную, а не берётся «как есть», по трём причинам:
//
// 1. **Размер пула задаётся явно.** Пул больше числа ядер не ускоряет, а замедляет:
//    соединения начинают конкурировать за те же ядра. Настройка вынесена в отдельную
//    переменную окружения, а не спрятана хвостом строки подключения — так её видно.
// 2. **Завершение по сигналу остановки.** Без него каждая перевыкатка оставляет
//    в базе живые сессии, и через десяток обновлений упирается лимит соединений.
// 3. **Живость базы проверяется через хранилище**, а не прямым доступом к клиенту
//    из проверки живости: клиент базы не должен быть виден за пределами этого слоя.

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from './prisma-client/client';

/** Настройки соединения. Собираются в одном месте, чтобы не разъехаться. */
export type DatabaseSettings = {
  connectionString: string;
  poolSize: number;
};

export const DATABASE_SETTINGS = Symbol('DATABASE_SETTINGS');

/** Значение по умолчанию: достаточно для машины разработки, на проде задаётся явно. */
const DEFAULT_POOL_SIZE = 10;

/** Настройки из окружения. Отсутствие строки подключения — ошибка запуска, не «потом». */
export function readDatabaseSettings(env: NodeJS.ProcessEnv = process.env): DatabaseSettings {
  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Не задана строка подключения к базе (DATABASE_URL). ' +
        'Локально база поднимается командой `npm run db:up`.',
    );
  }

  const poolSize = Number(env.DATABASE_POOL_SIZE ?? DEFAULT_POOL_SIZE);

  if (!Number.isInteger(poolSize) || poolSize < 1) {
    throw new Error(`Размер пула соединений задан неверно: ${env.DATABASE_POOL_SIZE}`);
  }

  return { connectionString, poolSize };
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly pool: Pool;

  readonly client: PrismaClient;

  constructor(@Inject(DATABASE_SETTINGS) settings: DatabaseSettings) {
    this.pool = new Pool({
      connectionString: settings.connectionString,
      max: settings.poolSize,
    });

    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool) });
  }

  /**
   * Жива ли база прямо сейчас.
   *
   * Отдельный метод, а не доступ к клиенту снаружи: проверке живости нужен ответ
   * «да или нет», а не сам клиент. Так граница хранилища остаётся целой.
   */
  async isAlive(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;

      return true;
    } catch {
      return false;
    }
  }

  /** Закрытие соединений при остановке процесса. */
  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }
}
