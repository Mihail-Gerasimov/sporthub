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

import { Inject, Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from './prisma-client/client';

/** Настройки соединения. Собираются в одном месте, чтобы не разъехаться. */
export type DatabaseSettings = {
  connectionString: string;
  poolSize: number;
  /**
   * Схема базы. Драйвер PostgreSQL параметр `?schema=` в строке подключения не понимает —
   * его знает только движок миграций, — поэтому имя достаётся адаптеру отдельно.
   * Без этого клиент молча уходит в `public`, и тесты со своей схемой видят пустую базу.
   */
  schema: string;
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

  // Схема указывается в строке подключения тем же параметром, что понимает движок
  // миграций, — чтобы адрес базы оставался одним значением, а не двумя.
  const schema = new URL(connectionString).searchParams.get('schema') ?? 'public';

  return { connectionString, poolSize, schema };
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private pool: Pool | null = null;

  private prisma: PrismaClient | null = null;

  /**
   * Настройки читаются лениво — вместе с первым обращением к клиенту.
   *
   * Так соединение не открывается там, где база не нужна: в режиме отката на файлы
   * и в тестах прежней реализации. Прежний вариант с чтением в конструкторе ронял
   * запуск на отсутствующей строке подключения ровно тогда, когда откат и требовался.
   */
  constructor(
    @Optional() @Inject(DATABASE_SETTINGS) private readonly settings?: DatabaseSettings,
  ) {}

  /** Клиент базы. Соединение открывается при первом обращении. */
  get client(): PrismaClient {
    if (this.prisma !== null) return this.prisma;

    const settings = this.settings ?? readDatabaseSettings();

    this.pool = new Pool({
      connectionString: settings.connectionString,
      max: settings.poolSize,
      // ⚠️ Схему задаём на самом соединении, а не только адаптеру. Адаптер подставляет
      // её в запросы, которые строит Prisma, но СЫРОЙ SQL идёт мимо — а на нём держится
      // атомарный счётчик мест. Без этой строки такой запрос ушёл бы в схему по умолчанию
      // и не нашёл таблицу — причём только там, где схема не `public`, то есть в тестах.
      options: `-c search_path="${settings.schema}"`,
    });

    this.prisma = new PrismaClient({
      adapter: new PrismaPg(this.pool, { schema: settings.schema }),
    });

    return this.prisma;
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

  /**
   * Закрытие соединений при остановке процесса.
   *
   * Ссылки снимаются ДО ожидания, а не после: остановку зовут дважды — сам Nest
   * и обвязка тестов, — и второй вызов успевал бы войти внутрь, пока первый ждёт.
   * Пул на это отвечает «закрыт повторно», и падает не соединение, а прогон.
   */
  async onModuleDestroy(): Promise<void> {
    const prisma = this.prisma;
    const pool = this.pool;

    this.prisma = null;
    this.pool = null;

    if (prisma === null) return;

    await prisma.$disconnect();
    await pool?.end();
  }
}
