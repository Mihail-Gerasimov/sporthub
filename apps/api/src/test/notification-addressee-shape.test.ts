// Форма строки уведомления: какому виду адресата какая ссылка полагается
// (шаги 37.7 и 37.8).
//
// ⚠️ Почему это проверяется НА БАЗЕ, а не в сервисе. Целостность обязана держаться
// базой: код, который «всегда проставляет владельца», проверяет сам себя, а прямой
// запрос, миграция или второй писатель его не спрашивают. До этой фазы форма строки
// была выражена наполовину — ограничение `notifications_addressee_one` говорило
// лишь «не более одного лица» и разрешало, например, строку вообще без адресата.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '../storage/prisma-client/client';
import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

describe('строка без владельца-человека (37.7)', () => {
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
        email: `shape-${counter}@test.local`,
        phone: '+7 (900) 000-00-00',
        passwordHash: 'x',
        accountKind: 'person',
        status: 'active',
      },
    });

    return created.id;
  };

  const payload = { subjectType: 'booking', subjectId: 1 } as Prisma.InputJsonValue;

  it('надзорная строка записывается БЕЗ человека', async () => {
    // Это и есть цена решения 5.2, ради которой снимался NOT NULL: у общей очереди
    // владельца нет. Подставленный администратор унёс бы строку каскадом вместе
    // со своей учётной записью.
    const created = await db.prisma.notification.create({
      data: {
        addresseeKind: 'supervision',
        type: 'publication_recheck_requested',
        payload,
      },
    });

    expect(created.userId).toBeNull();
    expect(created.addresseeKind).toBe('supervision');
  });

  it('надзорная строка переживает удаление любого человека', async () => {
    // Прямое следствие отсутствия владельца — и довод в пользу общей очереди:
    // след действия обязан пережить увольнение того, кто его совершил.
    const userId = await insertUser();
    const created = await db.prisma.notification.create({
      data: { addresseeKind: 'supervision', type: 'publication_recheck_requested', payload },
    });

    await db.prisma.user.delete({ where: { id: userId } });

    expect(await db.prisma.notification.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it('личная строка с владельцем по-прежнему записывается', async () => {
    // Контрольная группа: без неё «бесхозная записывается» было бы зелено и тогда,
    // когда перестало записываться вообще всё.
    const userId = await insertUser();

    const created = await db.prisma.notification.create({
      data: { userId, addresseeKind: 'personal', type: 'booking_requested', payload },
    });

    expect(created.userId).toBe(userId);
  });

  it('чтение бесхозной строки отказывает ЯВНО, а не подставляет ноль', async () => {
    // ⚠️ Временный мост шага 37.7: контракт научится называть строку без владельца
    // на шаге 37.11. До тех пор попытка прочитать такую строку обязана падать
    // громко. Подставленный ноль превратил бы её в чужую личную — ровно тот класс
    // тихих ошибок, от которого уходит вся фаза.
    await db.prisma.notification.create({
      data: { addresseeKind: 'supervision', type: 'publication_recheck_requested', payload },
    });

    const rows = await db.prisma.notification.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
  });
});
