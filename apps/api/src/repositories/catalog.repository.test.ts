// Тесты репозиториев связей тренер↔клуб, услуг и уведомлений.
//
// Контрактный набор прогоняется на единственной реализации — на базе. Раньше он шёл
// и по файлам: совпадение результатов доказывало, что интерфейс не протёк деталями
// хранилища. Файловая реализация удалена в фазе 34. Проверяем
// то, что обязано пережить смену хранилища: фильтры, порядок выдачи, постраничность,
// выбор основной услуги и дословные тексты ошибок.
//
// Данные каждая проверка заводит себе сама, через сам репозиторий. Так номера берутся
// из ответа вставки, а не задаются числом: у базы их выдаёт последовательность,
// и проверка «идентификатор равен единице» там неверна по построению.

import type { Notification, Offering, TrainerClubLink } from '@sporthub/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaTransactionRunner } from '../storage/prisma-transaction';
import { createTestDatabase, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import {
  type NotificationsRepository,
  type OfferingsRepository,
  type TrainerClubLinksRepository,
} from './catalog.repository';
import {
  PrismaNotificationsRepository,
  PrismaOfferingsRepository,
  PrismaTrainerClubLinksRepository,
} from './prisma/catalog.repository';

/** Три репозитория домена сразу: часть проверок связывает услугу с привязкой. */
type CatalogRepositories = {
  links: TrainerClubLinksRepository;
  offerings: OfferingsRepository;
  notifications: NotificationsRepository;
};

// Номера окружения: у базы это существующие
// строки: услуга ссылается на владельца и вид спорта, уведомление — на пользователя.
const USER_IDS = [1, 2];
const SPORT_IDS = [1, 2];
const CLUB_IDS = [1, 2];
const TRAINER_IDS = [1, 2];

const baseLink = {
  trainerId: 1,
  clubId: 1,
  status: 'pending',
  initiatedBy: 'trainer',
} as const satisfies Omit<TrainerClubLink, 'id' | 'createdAt'>;

const baseOffering = {
  ownerType: 'club',
  ownerId: 1,
  sportId: 1,
  title: 'Тренировка',
  description: 'Описание',
  format: 'group',
  price: 1000,
  durationMinutes: 60,
  capacity: 10,
  address: 'ул. Ленина, 1',
  coordinates: { lat: 53.2, lng: 50.1 },
} as const satisfies Omit<Offering, 'id' | 'createdAt'>;

const baseNotification = {
  userId: 1,
  type: 'booking_confirmed',
  payload: {},
} as const satisfies Omit<Notification, 'id' | 'createdAt'>;

/** Полезная нагрузка уведомления в удобном для сравнения виде. */
const payloadIndexes = (items: Notification[]): unknown[] =>
  items.map((item) => item.payload.index);

// --- Контрактный набор --------------------------------------------------------

const catalogContract = (createRepositories: () => Promise<CatalogRepositories>) => {
  describe('TrainerClubLinksRepository', () => {
    it('фильтрует по тренеру, клубу и статусу', async () => {
      const { links } = await createRepositories();
      await links.insert({ ...baseLink });
      await links.insert({ ...baseLink, trainerId: 2, status: 'confirmed' });

      expect(await links.findMany({ trainerId: 1 })).toHaveLength(1);
      expect(await links.findMany({ status: 'confirmed' })).toHaveLength(1);
      expect(await links.findMany({ trainerId: 1, status: 'confirmed' })).toHaveLength(0);
      expect(await links.findMany({ clubId: 1 })).toHaveLength(2);
      expect(await links.findMany({ clubId: 2 })).toHaveLength(0);
      expect(await links.findMany()).toHaveLength(2);
    });

    it('свежие привязки идут первыми', async () => {
      const { links } = await createRepositories();
      const first = await links.insert({ ...baseLink });
      const second = await links.insert({ ...baseLink, trainerId: 2 });

      expect((await links.findMany()).map((link) => link.id)).toEqual([second.id, first.id]);
    });

    it('findById находит созданную привязку, несуществующая отдаёт null', async () => {
      const { links } = await createRepositories();
      const created = await links.insert({ ...baseLink });

      expect(await links.findById(created.id)).toMatchObject({
        id: created.id,
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });
      expect(await links.findById(999)).toBeNull();
    });

    it('insert сохраняет сторону-инициатора и её пользователя', async () => {
      const { links } = await createRepositories();
      // `initiatedByUserId` есть в данных и в схеме, но пока не в типе связи.
      // Терять сведения при переносе нельзя — поле возится сверх типа.
      const withInitiator = { ...baseLink, initiatedBy: 'club' as const, initiatedByUserId: 1 };

      const created = await links.insert(withInitiator);

      expect(created.initiatedBy).toBe('club');
      expect((created as { initiatedByUserId?: number }).initiatedByUserId).toBe(1);
      const found = await links.findById(created.id);
      expect((found as { initiatedByUserId?: number } | null)?.initiatedByUserId).toBe(1);
    });

    it('обновление проставляет переданные поля', async () => {
      const { links } = await createRepositories();
      const created = await links.insert({ ...baseLink });

      const updated = await links.update(created.id, {
        status: 'confirmed',
        approvedAt: '2026-02-01T10:00:00.000Z',
        approvedByUserId: 2,
      });

      expect(updated).toMatchObject({
        id: created.id,
        status: 'confirmed',
        approvedAt: '2026-02-01T10:00:00.000Z',
        approvedByUserId: 2,
      });
      expect(await links.findById(created.id)).toMatchObject({ status: 'confirmed' });
    });

    it('разрыв связи фиксирует сторону и момент', async () => {
      const { links } = await createRepositories();
      const created = await links.insert({ ...baseLink, status: 'confirmed' });

      const updated = await links.update(created.id, {
        status: 'revoked',
        revokedAt: '2026-02-02T10:00:00.000Z',
        revokedBy: 'club',
        revokedByUserId: 2,
      });

      expect(updated).toMatchObject({
        status: 'revoked',
        revokedAt: '2026-02-02T10:00:00.000Z',
        revokedBy: 'club',
        revokedByUserId: 2,
      });
    });

    it('обновление несуществующей связи бросает дословный текст со стрелкой', async () => {
      const { links } = await createRepositories();

      // Символ «↔» в тексте — на него завязан существующий тест проекта.
      await expect(links.update(999, { status: 'confirmed' })).rejects.toThrow(
        'Привязка тренер↔клуб не найдена',
      );
    });
  });

  describe('OfferingsRepository', () => {
    it('фильтрует по владельцу, findFirst отдаёт первую заведённую услугу', async () => {
      const { offerings } = await createRepositories();
      const first = await offerings.insert({ ...baseOffering });
      await offerings.insert({ ...baseOffering, title: 'Вторая' });
      await offerings.insert({ ...baseOffering, ownerType: 'trainer', ownerId: 2 });

      expect(await offerings.findMany({ ownerType: 'club', ownerId: 1 })).toHaveLength(2);
      expect(await offerings.findMany({ ownerType: 'trainer', ownerId: 2 })).toHaveLength(1);

      // «Основная услуга» — та, что завели первой. Порядок задан явно, а не «как
      // легло»: без него карточка владельца показывала бы разную цену.
      const main = await offerings.findFirst({ ownerType: 'club', ownerId: 1 });
      expect(main).toMatchObject({ id: first.id, title: 'Тренировка' });
    });

    it('findFirst у владельца без услуг отдаёт null', async () => {
      const { offerings } = await createRepositories();
      await offerings.insert({ ...baseOffering });

      expect(await offerings.findFirst({ ownerType: 'trainer', ownerId: 1 })).toBeNull();
    });

    it('владелец переживает круг записи-чтения', async () => {
      const { offerings } = await createRepositories();

      const created = await offerings.insert({
        ...baseOffering,
        ownerType: 'trainer',
        ownerId: 2,
        cancellationPolicy: 'free_until_2h',
      });

      expect(await offerings.findById(created.id)).toMatchObject({
        ownerType: 'trainer',
        ownerId: 2,
        cancellationPolicy: 'free_until_2h',
        coordinates: { lat: 53.2, lng: 50.1 },
      });
    });

    it('услуга без политики отмены отдаётся без этого ключа', async () => {
      const { offerings } = await createRepositories();

      const created = await offerings.insert({ ...baseOffering });
      const found = await offerings.findById(created.id);

      // Эталон контрактов фиксирует ОТСУТСТВИЕ ключа, а не пустое значение.
      expect(found && 'cancellationPolicy' in found).toBe(false);
    });

    it('findAll отдаёт услуги в устойчивом порядке номеров', async () => {
      const { offerings } = await createRepositories();
      const first = await offerings.insert({ ...baseOffering });
      const second = await offerings.insert({ ...baseOffering, title: 'Вторая' });

      expect((await offerings.findAll()).map((item) => item.id)).toEqual([first.id, second.id]);
      expect(await offerings.findById(999)).toBeNull();
    });

    it('массовая правка снимает привязку к разорванной связи', async () => {
      const { links, offerings } = await createRepositories();
      const kept = await links.insert({ ...baseLink, status: 'confirmed' });
      const broken = await links.insert({ ...baseLink, trainerId: 2, status: 'confirmed' });

      const a = await offerings.insert({ ...baseOffering, trainerClubLinkId: broken.id });
      const b = await offerings.insert({ ...baseOffering, trainerClubLinkId: broken.id });
      await offerings.insert({ ...baseOffering, trainerClubLinkId: kept.id });

      const byLink = await offerings.findByLinkId(broken.id);
      expect(byLink.map((item) => item.id)).toEqual([a.id, b.id]);

      const updated = await offerings.updateMany(
        byLink.map((item) => item.id),
        { trainerClubLinkId: undefined },
      );

      expect(updated).toBe(2);
      expect(await offerings.findByLinkId(broken.id)).toHaveLength(0);
      expect(await offerings.findByLinkId(kept.id)).toHaveLength(1);
    });

    it('точечная правка меняет только переданные поля', async () => {
      const { offerings } = await createRepositories();
      const created = await offerings.insert({ ...baseOffering });

      const updated = await offerings.update(created.id, { price: 1500, title: 'Дороже' });

      expect(updated).toMatchObject({
        id: created.id,
        price: 1500,
        title: 'Дороже',
        description: 'Описание',
        capacity: 10,
      });
    });

    it('обновление несуществующей услуги бросает текст с id', async () => {
      const { offerings } = await createRepositories();

      await expect(offerings.update(999, { price: 1 })).rejects.toThrow(
        'Услуга с id 999 не найдена',
      );
    });

    it('пустой список идентификаторов — операция без эффекта', async () => {
      const { offerings } = await createRepositories();
      await offerings.insert({ ...baseOffering });

      expect(await offerings.updateMany([], { price: 1 })).toBe(0);
      expect(await offerings.removeMany([])).toBe(0);
      expect(await offerings.findAll()).toHaveLength(1);
    });

    it('массовые правка и удаление считают только реально затронутое', async () => {
      const { offerings } = await createRepositories();
      const created = await offerings.insert({ ...baseOffering });

      expect(await offerings.updateMany([created.id, 999], { price: 2000 })).toBe(1);
      expect((await offerings.findById(created.id))?.price).toBe(2000);
      expect(await offerings.removeMany([created.id, 999])).toBe(1);
      expect(await offerings.findAll()).toHaveLength(0);
    });
  });

  describe('NotificationsRepository', () => {
    it('свежие уведомления идут первыми', async () => {
      const { notifications } = await createRepositories();
      await notifications.insert({ ...baseNotification, payload: { index: 1 } });
      await notifications.insert({ ...baseNotification, payload: { index: 2 } });

      expect(payloadIndexes(await notifications.findMany({ userId: 1 }))).toEqual([2, 1]);
    });

    it('фильтр непрочитанных и подсчёт согласованы', async () => {
      const { notifications } = await createRepositories();
      const first = await notifications.insert({ ...baseNotification });
      await notifications.insert({ ...baseNotification });
      const read = await notifications.markRead(first.id);

      expect(read.readAt).toBeDefined();
      expect(await notifications.findMany({ userId: 1, unreadOnly: true })).toHaveLength(1);
      expect(await notifications.count({ userId: 1, unreadOnly: true })).toBe(1);
      expect(await notifications.count({ userId: 1 })).toBe(2);
    });

    it('непрочитанное отдаётся без ключа времени прочтения', async () => {
      const { notifications } = await createRepositories();
      const created = await notifications.insert({ ...baseNotification });

      const [found] = await notifications.findMany({ userId: 1 });

      expect(found.id).toBe(created.id);
      expect('readAt' in found).toBe(false);
    });

    it('лента чужого пользователя не смешивается со своей', async () => {
      const { notifications } = await createRepositories();
      await notifications.insert({ ...baseNotification });
      await notifications.insert({ ...baseNotification, userId: 2 });

      expect(await notifications.findMany({ userId: 1 })).toHaveLength(1);
      expect(await notifications.findMany({ userId: 2 })).toHaveLength(1);
      expect(await notifications.findMany({})).toHaveLength(2);
      expect(await notifications.count({ userId: 2 })).toBe(1);
    });

    it('пагинация режет отсортированный список', async () => {
      const { notifications } = await createRepositories();
      for (let index = 0; index < 5; index += 1) {
        await notifications.insert({ ...baseNotification, payload: { index } });
      }

      const page = await notifications.findMany({ userId: 1, offset: 1, limit: 2 });

      // Свежие первыми: 4, 3, 2, 1, 0 — значит второй и третий это 3 и 2.
      expect(payloadIndexes(page)).toEqual([3, 2]);
      expect(payloadIndexes(await notifications.findMany({ userId: 1, offset: 3 }))).toEqual([
        1, 0,
      ]);
    });

    it('полезная нагрузка переживает круг записи-чтения', async () => {
      const { notifications } = await createRepositories();

      const created = await notifications.insert({
        ...baseNotification,
        type: 'link_approved',
        payload: { clubId: 7, nested: { text: 'привет' }, list: [1, 2] },
      });

      const [found] = await notifications.findMany({ userId: 1 });

      expect(found.id).toBe(created.id);
      expect(found.type).toBe('link_approved');
      expect(found.payload).toEqual({ clubId: 7, nested: { text: 'привет' }, list: [1, 2] });
    });

    it('пометка несуществующего бросает дословный текст', async () => {
      const { notifications } = await createRepositories();

      await expect(notifications.markRead(999)).rejects.toThrow('Уведомление не найдено');
    });

    it('markAllRead помечает непрочитанные только своего пользователя', async () => {
      const { notifications } = await createRepositories();
      await notifications.insert({ ...baseNotification });
      await notifications.insert({ ...baseNotification });
      await notifications.insert({ ...baseNotification, userId: 2 });

      expect(await notifications.markAllRead({ userId: 1 })).toBe(2);
      expect(await notifications.count({ userId: 1, unreadOnly: true })).toBe(0);
      expect(await notifications.count({ userId: 2, unreadOnly: true })).toBe(1);
      // Повторный вызов ничего не находит и ничего не меняет.
      expect(await notifications.markAllRead({ userId: 1 })).toBe(0);
    });

    it('удаление считает только реально удалённое', async () => {
      const { notifications } = await createRepositories();
      const first = await notifications.insert({ ...baseNotification });

      expect(await notifications.removeMany([])).toBe(0);
      expect(await notifications.removeMany([first.id, 999])).toBe(1);
      expect(await notifications.findMany({ userId: 1 })).toHaveLength(0);
    });

    it('отбор по номерам не выпускает чужие уведомления', async () => {
      const { notifications } = await createRepositories();
      const own = await notifications.insert({ ...baseNotification });
      const foreign = await notifications.insert({ ...baseNotification, userId: 2 });

      // Так маршрут проверяет принадлежность: спрашивает про названные номера,
      // а не читает ленту пользователя целиком ради поиска в ней одной строки.
      expect(await notifications.count({ userId: 1, ids: [own.id] })).toBe(1);
      expect(await notifications.count({ userId: 1, ids: [foreign.id] })).toBe(0);
      expect(
        (await notifications.findMany({ userId: 1, ids: [own.id, foreign.id] })).map(
          (item) => item.id,
        ),
      ).toEqual([own.id]);
    });

    it('пустой список номеров означает «ни одного», а не «все»', async () => {
      const { notifications } = await createRepositories();
      await notifications.insert({ ...baseNotification });

      // ⚠️ Ловушка базы: условие без значений легко превращается в отсутствие
      // условия, и «удалить названные» стало бы «удалить всё».
      expect(await notifications.findMany({ userId: 1, ids: [] })).toHaveLength(0);
      expect(await notifications.count({ userId: 1, ids: [] })).toBe(0);
    });

    it('отключённые типы не попадают ни в ленту, ни в счётчик', async () => {
      const { notifications } = await createRepositories();
      await notifications.insert({ ...baseNotification, type: 'booking_confirmed' });
      await notifications.insert({ ...baseNotification, type: 'booking_completed' });

      // Настройки пользователя приходят сюда уже готовым списком типов: правило
      // «включён ли тип» разбирает домен, а репозиторий превращает список в условие.
      const filter = { userId: 1, excludeTypes: ['booking_completed'] };

      expect((await notifications.findMany(filter)).map((item) => item.type)).toEqual([
        'booking_confirmed',
      ]);
      expect(await notifications.count(filter)).toBe(1);
      // Пустой список настроек условия не даёт — лента остаётся целой.
      expect(await notifications.count({ userId: 1, excludeTypes: [] })).toBe(2);
    });

    it('постраничность считается ПОСЛЕ отсева отключённых типов', async () => {
      const { notifications } = await createRepositories();
      await notifications.insert({ ...baseNotification, payload: { index: 0 } });
      await notifications.insert({
        ...baseNotification,
        type: 'booking_completed',
        payload: { index: 1 },
      });
      await notifications.insert({ ...baseNotification, payload: { index: 2 } });

      // ⚠️ Именно ради этого отсев и уехал в запрос: срез по набору, отфильтрованному
      // уже ПОСЛЕ чтения, не совпадает со срезом внутри запроса. Свежие первыми —
      // после отсева остаются 2 и 0, значит второй элементом идёт 0.
      const page = await notifications.findMany({
        userId: 1,
        excludeTypes: ['booking_completed'],
        offset: 1,
        limit: 1,
      });

      expect(payloadIndexes(page)).toEqual([0]);
    });
  });
};

// --- Прогон на базе -----------------------------------------------------------

describe('Репозитории каталога — реализация на базе', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  /**
   * Окружение вместо данных: сами связи, услуги и уведомления заводят проверки,
   * а здесь появляется только то, на что они ссылаются. Без этих строк вставка
   * упала бы на внешнем ключе — в файле такой проверки не было вовсе.
   */
  const seedEnvironment = async () => {
    await db.truncateAll();

    for (const id of USER_IDS) {
      await db.prisma.user.create({
        data: {
          id,
          name: `Пользователь ${id}`,
          email: `user-${id}@example.com`,
          phone: '+7 900 000-00-00',
          passwordHash: 'хеш',
        },
      });
    }

    for (const id of SPORT_IDS) {
      await db.prisma.sport.create({
        data: {
          id,
          name: `Вид спорта ${id}`,
          slug: `sport-${id}`,
          description: '',
          icon: '',
          imageUrl: '',
        },
      });
    }

    for (const id of CLUB_IDS) {
      await db.prisma.club.create({
        data: {
          id,
          name: `Клуб ${id}`,
          slug: `club-${id}`,
          slugNormalized: `club-${id}`,
          description: '',
          shortDescription: '',
          city: 'Самара',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          latitude: 53.2,
          longitude: 50.1,
        },
      });
    }

    for (const id of TRAINER_IDS) {
      await db.prisma.trainer.create({
        data: {
          id,
          name: `Тренер ${id}`,
          slug: `trainer-${id}`,
          slugNormalized: `trainer-${id}`,
          bio: '',
          experienceYears: 1,
        },
      });
    }
  };

  describe('реализация на базе', () => {
    catalogContract(async () => {
      await seedEnvironment();
      const transactions = new PrismaTransactionRunner(db.service);

      return {
        links: new PrismaTrainerClubLinksRepository(transactions),
        offerings: new PrismaOfferingsRepository(transactions),
        notifications: new PrismaNotificationsRepository(transactions),
      };
    });
  });
});
