// Форма строки уведомления: какому виду адресата какая ссылка полагается
// (шаги 37.7 и 37.8).
//
// ⚠️ Почему это проверяется НА БАЗЕ, а не в сервисе. Целостность обязана держаться
// базой: код, который «всегда проставляет владельца», проверяет сам себя, а прямой
// запрос, миграция или второй писатель его не спрашивают. До этой фазы форма строки
// была выражена наполовину — ограничение `notifications_addressee_one` говорило
// лишь «не более одного лица» и разрешало, например, строку вообще без адресата.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { NOTIFICATION_ADDRESSEE_KINDS } from '@sporthub/domain';

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

  it('НЕИЗВЕСТНЫЙ вид адресата отбивается базой', async () => {
    // ⚠️ Ради этого случая ограничение записано дизъюнкцией, а не суммой CASE.
    // `CASE … END` без `ELSE` вернул бы на неизвестном виде NULL, а CHECK на NULL
    // строку ПРОПУСКАЕТ — то есть ограничение пропустило бы ровно то, против чего
    // писалось. Опечатка в одну букву — самый вероятный способ сюда попасть.
    const userId = await insertUser();

    await expect(
      db.prisma.$executeRawUnsafe(
        `INSERT INTO notifications (user_id, addressee_kind, type, payload, created_at)
         VALUES ($1, 'persona1', 'booking_requested', '{}'::jsonb, NOW())`,
        userId,
      ),
    ).rejects.toThrow(/notifications_addressee_kind/);
  });

  it('форма строки отбивает неизвестный вид адресата и БЕЗ словарного ограничения', async () => {
    // ⚠️ Диверсия д-40 (шаг 37.76). Форма записана ДИЗЪЮНКЦИЕЙ намеренно: сумма
    // `CASE` без `ELSE` вернула бы на неизвестном виде NULL, а `CHECK` на NULL строку
    // ПРОПУСКАЕТ. Пока рядом стоит словарное `notifications_addressee_kind`, разницы
    // в ответе нет — опечатку ловит оно, — и подмена дизъюнкции на сумму `CASE`
    // не краснела ничем: проверка выше падала бы по имени СОСЕДНЕГО ограничения.
    //
    // Здесь словарное ограничение снимается на время, и за неизвестный вид отвечает
    // САМА форма. Второй рубеж обязан быть рубежом, а не украшением: словарное
    // ограничение однажды снимут миграцией, и форма останется одна.
    //
    // ⚠️ Схема у файла НЕ своя: она принадлежит ИСПОЛНИТЕЛЮ (`test_<суффикс>_<worker>`),
    // и на ней же идут все остальные файлы этого исполнителя. Значит снятое и
    // не возвращённое ограничение задевает не «остальные проверки этого файла»,
    // а весь прогон — соседние файлы начали бы проверять базу без защиты.
    //
    // Поэтому возврат стоит в `finally` и ему предшествует уборка строки. Уборка
    // здесь не перестраховка: строка ложится ровно тогда, когда проверка ЛОВИТ
    // поломку, и тогда `ADD CONSTRAINT` сам падает на ней — схема осталась бы
    // без словарного ограничения именно в момент честного красного. Одна красная
    // проверка превращалась бы в россыпь чужих.
    const userId = await insertUser();

    await db.prisma.$executeRawUnsafe(
      'ALTER TABLE notifications DROP CONSTRAINT notifications_addressee_kind',
    );

    try {
      await expect(
        db.prisma.$executeRawUnsafe(
          `INSERT INTO notifications (user_id, addressee_kind, type, payload, created_at)
           VALUES ($1, 'persona1', 'booking_requested', '{}'::jsonb, NOW())`,
          userId,
        ),
      ).rejects.toThrow(/notifications_addressee_shape/);
    } finally {
      // Сначала убрать то, что могло лечь, и только потом возвращать ограничение:
      // иначе возврат падает на собственной строке (см. комментарий выше).
      await db.prisma.$executeRawUnsafe(
        "DELETE FROM notifications WHERE addressee_kind = 'persona1'",
      );
      await db.prisma.$executeRawUnsafe(
        `ALTER TABLE notifications ADD CONSTRAINT notifications_addressee_kind
           CHECK (addressee_kind IN (${NOTIFICATION_ADDRESSEE_KINDS.map((kind) => `'${kind}'`).join(
             ', ',
           )}))`,
      );
    }
  });

  it('надзорная строка С владельцем отбивается базой', async () => {
    const userId = await insertUser();

    await expect(
      db.prisma.notification.create({
        data: {
          userId,
          addresseeKind: 'supervision',
          type: 'publication_recheck_requested',
          payload,
        },
      }),
    ).rejects.toThrow(/notifications_addressee_shape/);
  });

  it('личная строка БЕЗ владельца отбивается базой', async () => {
    // ⚠️ Прежнее ограничение этого не ловило вовсе: «не более одного лица»
    // разрешало строку вообще без адресата. После снятия NOT NULL с владельца
    // такая строка стала возможной — и её ловит только новое ограничение.
    await expect(
      db.prisma.notification.create({
        data: { addresseeKind: 'personal', type: 'booking_requested', payload },
      }),
    ).rejects.toThrow(/notifications_addressee_shape/);
  });

  it('клубная строка БЕЗ клуба отбивается базой', async () => {
    const userId = await insertUser();

    await expect(
      db.prisma.notification.create({
        data: { userId, addresseeKind: 'club', type: 'booking_requested', payload },
      }),
    ).rejects.toThrow(/notifications_addressee_shape/);
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

describe('индексы очереди надзора и отбора по теме (37.10)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  const indexDefinition = async (name: string): Promise<string | undefined> => {
    const rows = await db.prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = $1`,
      name,
    );

    return rows[0]?.indexdef;
  };

  it('лента очереди и её счётчик неразобранного опираются на ЧАСТИЧНЫЕ индексы', async () => {
    // Частичные, а не обычные: строк очереди единицы на фоне всей ленты платформы,
    // и обычный индекс хранил бы всю таблицу ради одной её доли.
    // ⚠️ Сравнивается СМЫСЛ предиката, а не его буква. PostgreSQL приводит условие
    // к своей форме — `(addressee_kind)::text = 'supervision'::text`, — и посимвольное
    // сравнение с тем, что написано в скрипте, краснело бы всегда и ни о чём.
    const feed = await indexDefinition('notifications_supervision_idx');
    const unread = await indexDefinition('notifications_supervision_unread_idx');

    for (const definition of [feed, unread]) {
      expect(definition).toContain('WHERE');
      expect(definition).toContain('addressee_kind');
      expect(definition).toContain("'supervision'");
    }

    expect(unread).toContain('read_at IS NULL');
    expect(feed).not.toContain('read_at IS NULL');
  });

  it('индекс отбора по теме НЕ частичный', async () => {
    // ⚠️ Не придирка к оформлению. Тест схемы берёт из базы ВСЕ индексы с WHERE
    // и требует точного совпадения набора имён со скриптом ограничений. Частичный
    // индекс, заведённый через схему Prisma мимо этого скрипта, уронил бы сверку —
    // причём по ложной причине, и искали бы его долго.
    const themed = await indexDefinition('notifications_addressee_kind_type_created_at_idx');

    expect(themed).toBeDefined();
    expect(themed).not.toContain(' WHERE ');
  });
});
