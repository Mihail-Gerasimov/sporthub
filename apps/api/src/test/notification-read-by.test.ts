// Подпись «кто разобрал» у строки уведомления (шаг 37.6).
//
// ⚠️ Зачем колонка вообще. В личном ящике `read_at` отвечает на всё: разбирающий
// и владелец там один человек. В общей очереди надзора владельца нет, и `read_at`
// говорит «кто-то занялся», не говоря кто. Для очереди это половина ответа.
//
// ⚠️ Главная проверка набора — вторая: подпись гасится при удалении человека,
// но строку за собой НЕ УНОСИТ. Если бы здесь стоял каскад (как у владельца),
// удаление администратора вернуло бы в очередь давно разобранные строки —
// и вернуло бы молча, без единой ошибки.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '../storage/prisma-client/client';
import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

describe('подпись «кто разобрал» (37.6)', () => {
  let db: TestDatabase;
  let counter = 0;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.truncateAll();
    counter = 0;
  });

  const insertUser = async (): Promise<number> => {
    counter += 1;
    const created = await db.prisma.user.create({
      data: {
        name: `Человек ${counter}`,
        email: `read-by-${counter}@test.local`,
        phone: '+7 (900) 000-00-00',
        passwordHash: 'x',
        accountKind: 'person',
        status: 'active',
      },
    });

    return created.id;
  };

  const insertNotification = async (userId: number): Promise<number> => {
    const created = await db.prisma.notification.create({
      data: {
        userId,
        addresseeKind: 'personal',
        type: 'booking_requested',
        payload: { subjectType: 'booking', subjectId: 1 } as Prisma.InputJsonValue,
      },
    });

    return created.id;
  };

  it('по умолчанию подписи нет: вопрос «кто разобрал» ещё не задан', async () => {
    const userId = await insertUser();
    const id = await insertNotification(userId);

    const row = await db.prisma.notification.findUniqueOrThrow({ where: { id } });

    expect(row.readByUserId).toBeNull();
  });

  it('подпись записывается и читается', async () => {
    const ownerId = await insertUser();
    const resolverId = await insertUser();
    const id = await insertNotification(ownerId);

    await db.prisma.notification.update({
      where: { id },
      data: { readAt: new Date(), readByUserId: resolverId },
    });

    const row = await db.prisma.notification.findUniqueOrThrow({ where: { id } });

    expect(row.readByUserId).toBe(resolverId);
  });

  it('удаление разобравшего гасит подпись и НЕ уносит строку', async () => {
    // ⚠️ Ради этого колонка и объявлена через SET NULL, а не каскадом. Каскад
    // здесь означал бы: уволили администратора — и всё, что он разобрал, исчезло
    // из истории. Разобранное при этом должно остаться разобранным: возвращать
    // строки в очередь задним числом нельзя.
    const ownerId = await insertUser();
    const resolverId = await insertUser();
    const id = await insertNotification(ownerId);

    await db.prisma.notification.update({
      where: { id },
      data: { readAt: new Date(), readByUserId: resolverId },
    });

    await db.prisma.user.delete({ where: { id: resolverId } });

    const row = await db.prisma.notification.findUnique({ where: { id } });

    expect(row).not.toBeNull();
    expect(row?.readByUserId).toBeNull();
    // Строка осталась РАЗОБРАННОЙ: исчезла подпись, а не сам факт разбора.
    expect(row?.readAt).not.toBeNull();
  });

  it('удаление ВЛАДЕЛЬЦА по-прежнему уносит строку', async () => {
    // Контрольная проверка: два разных правила на двух колонках легко перепутать
    // местами, и без этого случая «гасится в NULL» было бы зелено и тогда,
    // когда каскад сняли бы у обеих.
    const ownerId = await insertUser();
    const id = await insertNotification(ownerId);

    await db.prisma.user.delete({ where: { id: ownerId } });

    expect(await db.prisma.notification.findUnique({ where: { id } })).toBeNull();
  });

  it('подпись не может ссылаться на несуществующего человека', async () => {
    const ownerId = await insertUser();
    const id = await insertNotification(ownerId);

    await expect(
      db.prisma.notification.update({
        where: { id },
        data: { readByUserId: 999999 },
      }),
    ).rejects.toThrow();
  });
});
