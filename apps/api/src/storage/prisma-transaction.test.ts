// Проверка транзакций поверх Prisma.
//
// Три вещи, каждая из которых ломается молча:
// 1. Вложенный вызов обязан присоединяться к открытой транзакции. Prisma вложенных
//    транзакций не поддерживает вовсе, и наивный перенос давал бы взаимную блокировку:
//    внутренняя ждала бы соединения, которое держит внешняя.
// 2. Сбой посреди работы обязан откатывать ВСЁ, а не половину.
// 3. Репозиторий обязан получать транзакционный клиент, ничего про транзакции не зная, —
//    иначе половина запросов уйдёт мимо транзакции и коммитнется отдельно.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import { PrismaTransactionRunner } from './prisma-transaction';

let db: TestDatabase;
let transactions: PrismaTransactionRunner;

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();
  transactions = new PrismaTransactionRunner(db.service);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.truncateAll();
});

/** Виды спорта — самая простая таблица без внешних ключей, на ней и проверяем. */
const sport = (name: string) => ({
  name,
  slug: name.toLowerCase(),
  description: '',
  icon: '',
  imageUrl: '',
  isPopular: false,
});

describe('Транзакция', () => {
  it('применяет всю работу целиком', async () => {
    await transactions.runInTransaction(async () => {
      await transactions.client.sport.create({ data: sport('Бокс') });
      await transactions.client.sport.create({ data: sport('Йога') });
    });

    expect(await db.prisma.sport.count()).toBe(2);
  });

  it('на сбое не оставляет ничего', async () => {
    await expect(
      transactions.runInTransaction(async () => {
        await transactions.client.sport.create({ data: sport('Бокс') });

        throw new Error('сбой посреди работы');
      }),
    ).rejects.toThrow('сбой посреди работы');

    expect(await db.prisma.sport.count()).toBe(0);
  });

  it('вложенный вызов присоединяется, а не открывает вторую', async () => {
    await transactions.runInTransaction(async () => {
      await transactions.client.sport.create({ data: sport('Бокс') });

      // Ровно так вызывается смена статуса записи изнутри отмены.
      await transactions.runInTransaction(async () => {
        await transactions.client.sport.create({ data: sport('Йога') });
      });
    });

    expect(await db.prisma.sport.count()).toBe(2);
  });

  it('сбой во вложенном вызове откатывает и внешнюю работу', async () => {
    await expect(
      transactions.runInTransaction(async () => {
        await transactions.client.sport.create({ data: sport('Бокс') });

        await transactions.runInTransaction(async () => {
          throw new Error('сбой внутри');
        });
      }),
    ).rejects.toThrow('сбой внутри');

    expect(await db.prisma.sport.count()).toBe(0);
  });

  it('до коммита работа не видна снаружи транзакции', async () => {
    await transactions.runInTransaction(async () => {
      await transactions.client.sport.create({ data: sport('Бокс') });

      // Отдельный клиент — отдельное соединение, для него транзакции ещё не было.
      expect(await db.prisma.sport.count()).toBe(0);
    });

    expect(await db.prisma.sport.count()).toBe(1);
  });

  it('снаружи транзакции запись уходит в базу сразу', async () => {
    await transactions.client.sport.create({ data: sport('Бокс') });

    expect(await db.prisma.sport.count()).toBe(1);
    expect(transactions.isInTransaction).toBe(false);
  });

  it('знает, открыта ли транзакция прямо сейчас', async () => {
    expect(transactions.isInTransaction).toBe(false);

    await transactions.runInTransaction(async () => {
      expect(transactions.isInTransaction).toBe(true);
    });

    expect(transactions.isInTransaction).toBe(false);
  });
});
