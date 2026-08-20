// Тесты простых CRUD-доменов: журнал, отзывы, пользователи, заметки провайдера.
//
// Один и тот же контрактный набор прогоняется ДВАЖДЫ — по файловой реализации
// и по реализации на базе. Совпадение результатов и есть доказательство обещания
// фазы: интерфейс репозитория не протёк деталями хранилища, поэтому сервисы,
// маршруты и их тесты можно не трогать.
//
// Два правила, без которых такой набор врёт:
//
// 1. **Никаких проверок «номер равен единице».** Номера выдаёт хранилище: в файле
//    это «максимальный плюс один», в базе — последовательность, и дырки в ней
//    переиспользовать нельзя. Проверяется свойство — номер новый, номер совпал
//    с тем, что вернула вставка, — а не конкретное число.
// 2. **Тексты ошибок сверяются дословно.** На них завязаны маршруты, которые
//    маппят сообщение в код ответа.
//
// У базы есть внешние ключи, которых у файла не было: журнал ссылается на
// исполнителя, отзыв — на автора и адресата, заметка — на обе стороны. Поэтому
// перед каждым набором заводится минимальный «мир» из родительских строк.
// Сами проверяемые коллекции в обоих мирах стартуют ПУСТЫМИ — иначе длины
// в проверках означали бы разное.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { User } from '@sporthub/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { JsonStorage } from '../storage/json-storage';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';
import { createTestDatabase, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import {
  JsonLogsRepository,
  JsonProviderClientNotesRepository,
  JsonReviewsRepository,
  JsonUsersRepository,
  type LogsRepository,
  type ProviderClientNotesRepository,
  type ReviewsRepository,
  type UsersRepository,
} from './crud.repository';
import {
  PrismaLogsRepository,
  PrismaProviderClientNotesRepository,
  PrismaReviewsRepository,
  PrismaUsersRepository,
} from './prisma/crud.repository';

/** Родительские строки, без которых база отвергнет вставку по внешнему ключу. */
type World = { users?: number[]; clubs?: number[]; trainers?: number[] };

async function seedWorld(db: TestDatabase, world: World): Promise<void> {
  for (const id of world.users ?? []) {
    await db.prisma.user.create({
      data: {
        id,
        role: 'athlete',
        name: `Пользователь ${id}`,
        email: `user${id}@test.local`,
        phone: '+7 (900) 000-00-00',
        passwordHash: 'hash',
      },
    });
  }

  for (const id of world.clubs ?? []) {
    await db.prisma.club.create({
      data: {
        id,
        name: `Клуб ${id}`,
        slug: `club-${id}`,
        slugNormalized: `club-${id}`,
        description: 'Описание',
        shortDescription: 'Кратко',
        city: 'Самара',
        address: 'Ленина 1',
        phone: '+7 (900) 000-00-00',
        latitude: 53.2,
        longitude: 50.1,
      },
    });
  }

  for (const id of world.trainers ?? []) {
    await db.prisma.trainer.create({
      data: {
        id,
        name: `Тренер ${id}`,
        slug: `trainer-${id}`,
        slugNormalized: `trainer-${id}`,
        bio: 'Био',
        experienceYears: 5,
      },
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// КОНТРАКТНЫЕ НАБОРЫ — по одному на домен, каждый прогоняется на обеих реализациях
// ═════════════════════════════════════════════════════════════════════════════

const logsContract = (createRepository: () => Promise<LogsRepository>) => {
  const base = {
    action: 'admin_login',
    actorId: 3,
    actorRole: 'admin',
    entityType: 'user',
    entityId: 3,
  } as const;

  it('запись получает номер и метку времени, читается обратно', async () => {
    const logs = await createRepository();

    const entry = await logs.insert({ ...base });

    // Проверяется свойство, а не число: номер выдаёт хранилище.
    expect(Number.isInteger(entry.id)).toBe(true);
    expect(entry.id).toBeGreaterThan(0);
    expect(() => new Date(entry.createdAt).toISOString()).not.toThrow();
    expect(await logs.findAll()).toHaveLength(1);
  });

  it('вторая запись получает НОВЫЙ номер, а не тот же самый', async () => {
    const logs = await createRepository();

    const first = await logs.insert({ ...base });
    const second = await logs.insert({ ...base });

    expect(second.id).not.toBe(first.id);
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('страница журнала отбирает по действию и по исполнителю', async () => {
    const logs = await createRepository();
    await logs.insert({ ...base });
    await logs.insert({ ...base, action: 'booking_create', actorId: 1, actorRole: 'athlete' });
    await logs.insert({ ...base, action: 'moderation_hide', actorId: 2 });

    expect((await logs.findPage({ action: 'booking_create' })).items).toHaveLength(1);
    expect((await logs.findPage({ actorId: 3 })).items).toHaveLength(1);
    expect((await logs.findPage({})).items).toHaveLength(3);
  });

  it('постраничность режет выдачу, но не общее число', async () => {
    const logs = await createRepository();
    await logs.insert({ ...base });
    await logs.insert({ ...base });
    await logs.insert({ ...base });

    const page = await logs.findPage({ offset: 1, limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
  });

  it('границы периода включают сами метки', async () => {
    const logs = await createRepository();
    const entry = await logs.insert({ ...base });

    const inside = await logs.findPage({ from: entry.createdAt, to: entry.createdAt });

    expect(inside.items.map((item) => item.id)).toEqual([entry.id]);
    // Момент строго позже метки уже не попадает — граница именно включительная.
    const after = new Date(new Date(entry.createdAt).getTime() + 1).toISOString();
    expect((await logs.findPage({ from: after })).items).toHaveLength(0);
  });

  it('свежие идут первыми, при равных метках — по убыванию номера', async () => {
    const logs = await createRepository();
    const first = await logs.insert({ ...base });
    const second = await logs.insert({ ...base });
    const third = await logs.insert({ ...base });

    const page = await logs.findPage({});

    // Тай-брейкер по номеру обязателен: вставки укладываются в одну миллисекунду,
    // и без него порядок был бы случайным от прогона к прогону.
    expect(page.items.map((item) => item.id)).toEqual([third.id, second.id, first.id]);
  });

  it('меты нет — ключа нет вовсе', async () => {
    const logs = await createRepository();

    const entry = await logs.insert({ ...base });

    // Разница между «ключа нет» и «ключ есть и пустой» видна сверке контрактов.
    expect('meta' in entry).toBe(false);
  });

  it('мета сохраняется как есть', async () => {
    const logs = await createRepository();

    const entry = await logs.insert({ ...base, meta: { scheduleId: 7, source: 'тест' } });

    expect(entry.meta).toEqual({ scheduleId: 7, source: 'тест' });
  });
};

const reviewsContract = (createRepository: () => Promise<ReviewsRepository>) => {
  it('создаёт отзыв и отдаёт его в общем списке', async () => {
    const reviews = await createRepository();

    const review = await reviews.insert({ userId: 1, clubId: 1, rating: 5, text: 'Отлично' });

    expect(Number.isInteger(review.id)).toBe(true);
    expect(await reviews.findAll()).toHaveLength(1);
    // Второй адресат не заводится пустым ключом — его в ответе нет вовсе.
    expect('trainerId' in review).toBe(false);
  });

  it('фильтрует по клубу и по тренеру раздельно', async () => {
    const reviews = await createRepository();
    await reviews.insert({ userId: 1, clubId: 1, rating: 5, text: 'Клубный' });
    await reviews.insert({ userId: 1, trainerId: 2, rating: 4, text: 'Тренерский' });

    expect(await reviews.findMany({ clubId: 1 })).toHaveLength(1);
    expect(await reviews.findMany({ trainerId: 2 })).toHaveLength(1);
    expect(await reviews.findMany({})).toHaveLength(2);
  });

  it('удаление по владельцу забирает только его отзывы', async () => {
    const reviews = await createRepository();
    await reviews.insert({ userId: 1, clubId: 1, rating: 5, text: 'Клубный' });
    await reviews.insert({ userId: 1, trainerId: 2, rating: 4, text: 'Тренерский' });

    const removed = await reviews.removeMany({ clubId: 1 });

    expect(removed).toBe(1);
    expect(await reviews.findAll()).toHaveLength(1);
  });

  it('пустой фильтр удаления не забирает НИЧЕГО', async () => {
    const reviews = await createRepository();
    await reviews.insert({ userId: 1, clubId: 1, rating: 5, text: 'Клубный' });

    // ⚠️ На базе это ловушка: удаление без условия вычистило бы таблицу целиком.
    const removed = await reviews.removeMany({});

    expect(removed).toBe(0);
    expect(await reviews.findAll()).toHaveLength(1);
  });
};

const usersContract = (createRepository: () => Promise<UsersRepository>) => {
  const newUser: Omit<User, 'id' | 'createdAt'> = {
    role: 'athlete',
    name: 'Иван',
    email: 'ivan@test.local',
    phone: '+7 (900) 000-00-00',
    passwordHash: 'secret1',
    favoriteClubIds: [] as number[],
  };

  it('создаёт пользователя и находит его по номеру и по почте', async () => {
    const users = await createRepository();

    const created = await users.insert({ ...newUser });

    expect(await users.findById(created.id)).toMatchObject({ email: 'ivan@test.local' });
    expect(await users.findByEmail('ivan@test.local')).toMatchObject({ id: created.id });
  });

  it('поиск по несуществующим ключам отдаёт null, а не бросает', async () => {
    const users = await createRepository();

    expect(await users.findById(999)).toBeNull();
    expect(await users.findByEmail('нет@такого.local')).toBeNull();
  });

  it('обновление меняет только переданные поля', async () => {
    const users = await createRepository();
    const created = await users.insert({ ...newUser });

    const updated = await users.update(created.id, { phone: '+7 (999) 111-11-11' });

    expect(updated.phone).toBe('+7 (999) 111-11-11');
    expect(updated.email).toBe('ivan@test.local');
    expect(updated.name).toBe('Иван');
  });

  it('обновление несуществующего пользователя бросает с текстом из db.ts', async () => {
    const users = await createRepository();

    // Текст обязан совпадать дословно: на него завязаны роуты и тесты.
    await expect(users.update(999, { phone: '+7 (999) 111-11-11' })).rejects.toThrow(
      'Пользователь не найден',
    );
  });

  it('избранные клубы сохраняются при создании и правятся набором', async () => {
    const users = await createRepository();
    const created = await users.insert({ ...newUser, favoriteClubIds: [1, 2] });

    expect(created.favoriteClubIds).toEqual([1, 2]);

    // Один клуб убирается, другой добавляется — правка идёт диффом, а не заменой.
    const updated = await users.update(created.id, { favoriteClubIds: [2, 3] });

    expect([...updated.favoriteClubIds].sort()).toEqual([2, 3]);
    expect((await users.findById(created.id))?.favoriteClubIds).toHaveLength(2);
  });

  it('пустое избранное остаётся ключом с пустым набором', async () => {
    const users = await createRepository();

    const created = await users.insert({ ...newUser });

    // ⚠️ Эталон контрактов ждёт именно ключ с пустым массивом, а не отсутствие ключа.
    expect(created.favoriteClubIds).toEqual([]);
  });

  it('настройки уведомлений сохраняются, а пустых ключом не становятся', async () => {
    const users = await createRepository();
    const withoutPreferences = await users.insert({ ...newUser });

    expect(withoutPreferences.notificationPreferences).toBeUndefined();

    const updated = await users.update(withoutPreferences.id, {
      notificationPreferences: { booking_rejected: false },
    });

    expect(updated.notificationPreferences).toEqual({ booking_rejected: false });
  });

  it('правка с пустым значением СТИРАЕТ поле, а не оставляет прежнее', async () => {
    const users = await createRepository();
    const created = await users.insert({
      ...newUser,
      notifiedQuarantineUntil: '2026-05-01T00:00:00.000Z',
    });

    expect(created.notifiedQuarantineUntil).toBe('2026-05-01T00:00:00.000Z');

    // На этом держится снятие карантина администратором: маршрут шлёт ключ
    // с пустым значением, и метка обязана исчезнуть.
    const updated = await users.update(created.id, { notifiedQuarantineUntil: undefined });

    expect(updated.notifiedQuarantineUntil).toBeUndefined();
    expect((await users.findById(created.id))?.notifiedQuarantineUntil).toBeUndefined();
  });
};

const notesContract = (createRepository: () => Promise<ProviderClientNotesRepository>) => {
  it('создаёт заметку и фильтрует по провайдеру и клиенту', async () => {
    const notes = await createRepository();
    await notes.insert({ providerUserId: 2, clientUserId: 1, note: 'Первая' });
    await notes.insert({ providerUserId: 2, clientUserId: 3, note: 'Вторая' });

    expect(await notes.findMany({ providerUserId: 2 })).toHaveLength(2);
    expect(await notes.findMany({ providerUserId: 2, clientUserId: 1 })).toHaveLength(1);
  });

  it('сортировка по убыванию времени создания', async () => {
    const notes = await createRepository();
    await notes.insert({ providerUserId: 2, clientUserId: 1, note: 'Первая' });
    await notes.insert({ providerUserId: 2, clientUserId: 1, note: 'Вторая' });

    const found = await notes.findMany({ providerUserId: 2 });

    // Свежая заметка идёт первой. Метки совпадают до миллисекунды, поэтому
    // порядок держит тай-брейкер по номеру — на обеих реализациях одинаково.
    expect(found[0].note).toBe('Вторая');
  });

  it('момент создания и момент правки при создании совпадают', async () => {
    const notes = await createRepository();

    const created = await notes.insert({ providerUserId: 2, clientUserId: 1, note: 'Первая' });

    expect(created.updatedAt).toBe(created.createdAt);
  });

  it('обновление меняет текст и не трогает момент создания', async () => {
    const notes = await createRepository();
    const created = await notes.insert({ providerUserId: 2, clientUserId: 1, note: 'Было' });

    const updated = await notes.update(created.id, { note: 'Стало' });

    expect(updated.note).toBe('Стало');
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('обновление несуществующей заметки бросает с текстом из db.ts', async () => {
    const notes = await createRepository();

    await expect(notes.update(999, { note: 'x' })).rejects.toThrow('Заметка провайдера не найдена');
  });

  it('удаление убирает заметку', async () => {
    const notes = await createRepository();
    const created = await notes.insert({ providerUserId: 2, clientUserId: 1, note: 'Первая' });

    await notes.remove(created.id);

    expect(await notes.findById(created.id)).toBeNull();
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// ПРОГОН НА ФАЙЛОВОЙ РЕАЛИЗАЦИИ
// ═════════════════════════════════════════════════════════════════════════════

describe('Простые CRUD-репозитории — файловая реализация', () => {
  let dataDirectory: string;
  let storage: JsonStorage;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-crud-'));
    storage = new JsonStorage(dataDirectory);
    for (const file of ['logs.json', 'reviews.json', 'users.json', 'provider-client-notes.json']) {
      await writeFile(path.join(dataDirectory, file), '[]\n', 'utf8');
    }
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe('LogsRepository', () => {
    logsContract(async () => new JsonLogsRepository(storage));
  });

  describe('ReviewsRepository', () => {
    reviewsContract(async () => new JsonReviewsRepository(storage));
  });

  describe('UsersRepository', () => {
    usersContract(async () => new JsonUsersRepository(storage));
  });

  describe('ProviderClientNotesRepository', () => {
    notesContract(async () => new JsonProviderClientNotesRepository(storage));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ТОТ ЖЕ НАБОР НА БАЗЕ
// ═════════════════════════════════════════════════════════════════════════════

describe('Простые CRUD-репозитории — реализация на базе', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  /** Чистая схема плюс родительские строки под внешние ключи набора. */
  const prepare = async (world: World): Promise<PrismaTransactionRunner> => {
    await db.truncateAll();
    await seedWorld(db, world);

    return new PrismaTransactionRunner(db.service);
  };

  describe('LogsRepository', () => {
    // Журнал ссылается на исполнителя: без пользователей вставка не пройдёт.
    logsContract(async () => new PrismaLogsRepository(await prepare({ users: [1, 2, 3] })));
  });

  describe('ReviewsRepository', () => {
    reviewsContract(
      async () =>
        new PrismaReviewsRepository(
          await prepare({ users: [1, 2], clubs: [1, 2], trainers: [1, 2] }),
        ),
    );
  });

  describe('UsersRepository', () => {
    // Пользователи заводятся самим набором, поэтому в мире только клубы —
    // они нужны избранному.
    usersContract(async () => new PrismaUsersRepository(await prepare({ clubs: [1, 2, 3] })));
  });

  describe('ProviderClientNotesRepository', () => {
    notesContract(
      async () => new PrismaProviderClientNotesRepository(await prepare({ users: [1, 2, 3] })),
    );
  });
});
