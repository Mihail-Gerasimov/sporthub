// Надзорная строка не видна ни в одном человеческом ящике (шаг 37.9).
//
// ⚠️ Зачем отдельный набор, если ящики уже покрыты тестами контроллера. Те тесты
// проверяют, что клуб не видит карточку тренера, — то есть разделение МЕЖДУ лицами.
// Здесь проверяется другое: строка, у которой человеческого адресата нет вовсе,
// не должна протекать в личный ящик. До шага 37.9 личный ящик описывался как
// «обе колонки лица пусты», и надзорная строка подходила под это описание дословно.
//
// ⚠️ Проверка устроена так, что протечка не может пройти незамеченной. Читатель
// строки без владельца падает явным отказом (мост шага 37.7) — значит если
// надзорная строка всё-таки попадёт в выдачу личного ящика, набор не «покажет
// лишнюю строку», а свалится с понятным сообщением.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { Prisma } from '../storage/prisma-client/client';
import { PrismaService } from '../storage/prisma.service';
import { createTestHarness, type TestHarness } from './harness';

describe('ящики не протекают друг в друга (37.9)', () => {
  let harness: TestHarness;
  let notifications: NotificationsRepository;
  let prisma: PrismaService['client'];

  beforeAll(async () => {
    harness = await createTestHarness('notification-mailbox-isolation');
    notifications = harness.app.get(NOTIFICATIONS_REPOSITORY);
    // ⚠️ Клиент берётся У ПРИЛОЖЕНИЯ, а не заводится второй: два пула на набор —
    // та самая причина, по которой прогон тестов мигал до шага 36.30.
    prisma = harness.app.get(PrismaService).client;
  });

  afterAll(async () => {
    await harness.close();
  });

  const payload = { subjectType: 'club', subjectId: 1 } as Prisma.InputJsonValue;

  let personId = 0;

  beforeEach(async () => {
    // Засев через обвязку: она пересобирает базу целиком и держит целостность.
    await harness.writeMany({ users: [], notifications: [] });

    const person = await prisma.user.create({
      data: {
        name: 'Человек',
        email: 'mailbox-isolation@test.local',
        phone: '+7 (900) 000-00-00',
        passwordHash: 'x',
        accountKind: 'person',
        status: 'active',
      },
    });

    personId = person.id;

    // Личная строка этого человека — контрольная группа.
    await prisma.notification.create({
      data: {
        userId: personId,
        addresseeKind: 'personal',
        type: 'booking_requested',
        payload,
      },
    });

    // Надзорная строка: адресата-человека у неё нет вовсе.
    await prisma.notification.create({
      data: {
        addresseeKind: 'supervision',
        type: 'publication_recheck_requested',
        payload,
      },
    });
  });

  it('личный ящик отдаёт только личную строку', async () => {
    const rows = await notifications.findMany({
      userId: personId,
      mailbox: { kind: 'personal' },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('booking_requested');
  });

  it('счётчик личного ящика надзорную строку не считает', async () => {
    // ⚠️ Лента и счётчик — два разных запроса, и именно на их расхождении
    // проект обжёгся трижды за две фазы. Поэтому проверяются оба, а не один.
    const total = await notifications.count({ userId: personId, mailbox: { kind: 'personal' } });

    expect(total).toBe(1);
  });

  it('объединённый срез «всё моё» надзорную строку не захватывает', async () => {
    // Срез без ящика — самый широкий человеческий запрос, какой есть.
    // Если протечёт где-то, то здесь.
    const rows = await notifications.findMany({ userId: personId });

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('booking_requested');
  });

  it('надзорная строка лежит в базе: набор проверяет отбор, а не пустоту', async () => {
    // ⚠️ Без этой проверки все три предыдущие зеленели бы и в случае, когда
    // надзорная строка просто не записалась. Ровно так фаза 36 получила три
    // ложно-зелёные диверсии.
    const stored = await prisma.notification.count({
      where: { addresseeKind: 'supervision' },
    });

    expect(stored).toBe(1);
  });
});
