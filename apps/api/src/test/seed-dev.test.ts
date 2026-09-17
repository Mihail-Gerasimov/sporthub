// Проверка сида для разработки (шаг 33.19a).
//
// Сид — единственное, что остаётся после удаления каталога `data/` (шаг 33.58).
// Если он молча перестанет работать, это заметит не тест, а новый разработчик:
// он поднимет базу, увидит пустой каталог и не сможет отличить сломанный проект
// от ненаполненного. Поэтому проверяется не «функция отработала», а то, что после
// неё проектом действительно можно пользоваться: есть чем войти под каждой ролью,
// есть что показать в каталоге и есть на что записаться.

import { fixtureSports } from '@sporthub/fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyPassword } from '../common/password';
import { buildDevSourceData, DEV_PASSWORD, seedDevData } from '../storage/seed/dev-seed';
import {
  assertDemoSeedAllowed,
  DEMO_SEED_OVERRIDE,
  writeDevSeed,
} from '../storage/seed/write-dev-seed';
import type { ImportReport } from '../storage/seed/import-from-files';

import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

/** Опорный день фиксирован: иначе проверка «занятия в будущем» зависела бы от часа прогона. */
const TODAY = new Date('2026-08-20T00:00:00.000Z');

let db: TestDatabase;
let report: ImportReport;

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();

  await db.truncateAll();
  report = await seedDevData({ client: db.prisma, today: TODAY });
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe('Справочники', () => {
  it('наполнены целиком, а не парой строк для тестов', async () => {
    expect(await db.prisma.city.count()).toBeGreaterThanOrEqual(6);
    expect(await db.prisma.tag.count()).toBeGreaterThanOrEqual(15);
    expect(await db.prisma.amenity.count()).toBeGreaterThanOrEqual(15);
    expect(await db.prisma.specialty.count()).toBeGreaterThanOrEqual(15);
    expect(await db.prisma.workFormat.count()).toBeGreaterThanOrEqual(6);
  });

  it('виды спорта берутся из общего пакета, а не из своей копии', async () => {
    const rows = await db.prisma.sport.findMany({ orderBy: { id: 'asc' } });

    expect(
      rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        name: row.name,
        slug: row.slug,
        description: row.description,
        icon: row.icon,
        imageUrl: row.imageUrl,
        isPopular: row.isPopular,
        // Цвет на карте (38.80) — сид пишет его при вставке; пустой не бывает у видов сида.
        color: row.color ?? undefined,
      })),
    ).toStrictEqual(fixtureSports);
  });

  it('города получили нормализованное имя — без него дедупликация не работает', async () => {
    const samara = await db.prisma.city.findFirstOrThrow({ where: { name: 'Самара' } });

    expect(samara.nameNormalized).toBe('самара');
  });
});

describe('Учётные записи', () => {
  it('есть по одной на каждый набор лиц услуг и ровно один администратор', async () => {
    // ⚠️ Шаг 35.24. Прежде проверялось «по одной на каждую роль» — после удаления
    // роли проверять стало нечего, а покрывать надо другое: сид обязан давать
    // все пять наборов, по которым собирается кабинет.
    const users = await db.prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: { managedClubs: true, managedTrainers: true },
    });

    const shape = users.map((user) => ({
      kind: user.accountKind,
      clubs: user.managedClubs.length > 0,
      cards: user.managedTrainers.length > 0,
    }));

    expect(shape).toEqual([
      { kind: 'admin', clubs: false, cards: false },
      { kind: 'person', clubs: true, cards: false },
      { kind: 'person', clubs: false, cards: true },
      { kind: 'person', clubs: false, cards: false },
      // Пятый набор — и зал, и персоналки. В прежней модели он был невыразим:
      // роль позволяла быть кем-то одним.
      { kind: 'person', clubs: true, cards: true },
      // Люди макета (38.115): два тренера с карточками, трое спортсменов-рецензентов.
      { kind: 'person', clubs: false, cards: true },
      { kind: 'person', clubs: false, cards: false },
      { kind: 'person', clubs: false, cards: false },
      { kind: 'person', clubs: false, cards: true },
      { kind: 'person', clubs: false, cards: false },
    ]);
  });

  it('администратор один и он не потерялся при удалении роли', async () => {
    // ⚠️ Главная проверка шага 35.24. Признак администратора — единственное,
    // что не выводится из владения: потеряй его сид, и площадка поднимется
    // без входа в служебную панель, а заметить это будет нечем.
    const admins = await db.prisma.user.findMany({ where: { accountKind: 'admin' } });

    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe('admin@sporthub.local');
  });

  it('пароль лежит хешем и подходит к объявленному', async () => {
    for (const user of await db.prisma.user.findMany()) {
      expect(user.passwordHash.startsWith('$argon2id$'), `пользователь ${user.id}`).toBe(true);
      expect(user.passwordHash).not.toContain(DEV_PASSWORD);
      expect(await verifyPassword(user.passwordHash, DEV_PASSWORD)).toBe(true);
    }
  });
});

describe('Демонабор', () => {
  it('в каталоге есть клубы, карточки тренеров и подтверждённая связь', async () => {
    // ⚠️ Фаза 35: публикаций стало больше, и не случайно. Пятый человек сида
    // владеет И клубом, И карточкой тренера — набором лиц, который в прежней
    // модели выразить было нельзя вовсе: роль позволяла быть кем-то одним.
    // 38.115: шесть клубов и четыре тренера — как на витрине макета.
    expect(await db.prisma.club.count()).toBe(6);
    expect(await db.prisma.trainer.count()).toBe(4);

    const link = await db.prisma.trainerClubLink.findFirstOrThrow({ orderBy: { id: 'asc' } });

    expect(link.status).toBe('confirmed');
    expect(link.trainerId).toBe(1);
    expect(link.clubId).toBe(1);
  });

  // --- Сид под макет (38.115) ---

  it('в боевом окружении сид отказывает до записи; явное разрешение — единственный ключ', async () => {
    // Знаки «проверено» и отзывы набора синтетические: на боевой базе — подделка.
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' })).toThrow(/NODE_ENV=production/);
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: 'production', [DEMO_SEED_OVERRIDE]: '1' }),
    ).not.toThrow();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertDemoSeedAllowed({})).not.toThrow();

    // Отказ стоит у самого писателя: базу он не трогает вовсе.
    const before = await db.prisma.user.count();
    const source = await buildDevSourceData(TODAY);

    await expect(
      writeDevSeed({ client: db.prisma, source, env: { NODE_ENV: 'production' } }),
    ).rejects.toThrow(/SPORTHUB_ALLOW_DEMO_SEED=1/);
    expect(await db.prisma.user.count()).toBe(before);
  });

  it('у каждого клуба есть снимок, у каждого тренера — лицо: адреса макета', async () => {
    const clubs = await db.prisma.club.findMany({
      include: { images: true },
      orderBy: { id: 'asc' },
    });
    const trainers = await db.prisma.trainer.findMany({ orderBy: { id: 'asc' } });

    for (const club of clubs) {
      expect(club.images.length, `у клуба «${club.name}» нет снимка`).toBeGreaterThan(0);
      expect(club.images[0].url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-.*w=500&h=220/);
    }
    for (const trainer of trainers) {
      expect(trainer.avatarUrl, `у тренера «${trainer.name}» нет лица`).toMatch(
        /^https:\/\/images\.unsplash\.com\/photo-.*w=200&h=200.*crop=faces/,
      );
    }
  });

  it('у каждой публикации несколько отзывов, рейтинг посчитан из них, часть подтверждена', async () => {
    const clubs = await db.prisma.club.findMany({
      include: { reviews: true },
      orderBy: { id: 'asc' },
    });
    const trainers = await db.prisma.trainer.findMany({
      include: { reviews: true },
      orderBy: { id: 'asc' },
    });

    for (const subject of [...clubs, ...trainers]) {
      expect(subject.reviews.length, `«${subject.name}»: отзывов`).toBeGreaterThanOrEqual(3);
      expect(subject.reviewCount).toBe(subject.reviews.length);
      const mean = subject.reviews.reduce((sum, r) => sum + r.rating, 0) / subject.reviews.length;

      expect(Math.abs(subject.rating - mean)).toBeLessThan(0.06);
      expect(subject.rating).toBeGreaterThanOrEqual(4.5);
    }

    // Автор отзыва — не владелец предмета (правило «сам себе»).
    for (const club of clubs) {
      expect(club.reviews.some((r) => r.userId === club.managedByUserId)).toBe(false);
    }
    for (const trainer of trainers) {
      expect(trainer.reviews.some((r) => r.userId === trainer.managedByUserId)).toBe(false);
    }

    // Знак «проверено» — у части, не у всех: на карточках видна разница.
    expect(clubs.filter((c) => c.verifiedAt !== null).length).toBeGreaterThanOrEqual(3);
    expect(clubs.some((c) => c.verifiedAt === null)).toBe(true);
    expect(trainers.filter((t) => t.verifiedAt !== null).length).toBeGreaterThanOrEqual(2);
    expect(trainers.some((t) => t.verifiedAt === null)).toBe(true);
  });

  it('занятия есть «сегодня» и «завтра» относительно опорного дня — у клубов и у тренеров', async () => {
    const slots = await db.prisma.schedule.findMany({ orderBy: { id: 'asc' } });
    const dateKey = (d: Date) => d.toISOString().slice(0, 10);
    const today = dateKey(TODAY);
    const tomorrow = dateKey(new Date(TODAY.getTime() + 86_400_000));

    const clubToday = slots.filter((s) => s.ownerClubId !== null && dateKey(s.date) === today);
    const clubTomorrow = slots.filter(
      (s) => s.ownerClubId !== null && dateKey(s.date) === tomorrow,
    );
    const trainerToday = slots.filter(
      (s) => s.ownerTrainerId !== null && dateKey(s.date) === today,
    );

    expect(clubToday.length).toBeGreaterThanOrEqual(5);
    expect(clubTomorrow.length).toBeGreaterThanOrEqual(3);
    expect(trainerToday.length).toBeGreaterThanOrEqual(3);
    // Поздние занятия: вечером в день сида на витрине ещё есть что показать.
    // Время в базе — `time` (в клиенте — Date на эпохе), сравниваем часы UTC.
    expect(clubToday.some((s) => s.startTime.getUTCHours() >= 21)).toBe(true);
    // Места свободны везде: занятость считается из живых записей, а их сид не заводит.
    expect(clubToday.every((s) => s.bookedCount === 0 && s.capacity > 0)).toBe(true);
  });

  it('в сиде есть человек с двумя лицами — клубом и карточкой тренера', async () => {
    // Живой случай заказчика: свой зал плюс персоналки на выезде. Без такого
    // человека ни один сценарий кабинета с двумя лицами не проверяется.
    const [clubs, trainers] = await Promise.all([
      db.prisma.club.findMany({ where: { managedByUserId: 5 } }),
      db.prisma.trainer.findMany({ where: { managedByUserId: 5 } }),
    ]);

    expect(clubs.length, 'у человека с двумя лицами нет клуба').toBeGreaterThan(0);
    expect(trainers.length, 'у человека с двумя лицами нет карточки тренера').toBeGreaterThan(0);
  });

  it('тренерская услуга собрана «в зале клуба» — самый хрупкий путь каталога', async () => {
    const offering = await db.prisma.offering.findFirstOrThrow({
      where: { ownerTrainerId: { not: null } },
    });

    expect(offering.ownerClubId).toBeNull();
    expect(offering.venueClubId).toBe(1);
    expect(offering.trainerClubLinkId).toBe(1);
  });

  it('занятия лежат не в прошлом — с опорного дня и дальше, записаться можно с первой минуты', async () => {
    const slots = await db.prisma.schedule.findMany({ orderBy: { id: 'asc' } });

    expect(slots.length).toBeGreaterThanOrEqual(3);

    for (const slot of slots) {
      // 38.115: занятия начинаются с самого опорного дня («сегодня»), а не с завтрашнего.
      expect(slot.date.getTime(), `слот ${slot.id}`).toBeGreaterThanOrEqual(TODAY.getTime());
      expect(slot.bookedCount).toBeLessThanOrEqual(slot.capacity);
      expect(slot.capacity).toBeGreaterThan(0);
    }
  });

  it('у каждого слота есть услуга и вид спорта из справочника', async () => {
    const slots = await db.prisma.schedule.findMany({
      include: { offering: true, sport: true },
      orderBy: { id: 'asc' },
    });

    for (const slot of slots) {
      expect(slot.offering, `слот ${slot.id}`).not.toBeNull();
      expect(slot.sport, `слот ${slot.id}`).not.toBeNull();
    }
  });
});

describe('Свойства самого сида', () => {
  it('чистка мусорных текстов к нему не применяется', () => {
    // Словарь починок привязан к номерам записей боевых данных. Сид со слотом
    // номер 9 получил бы чужое название зала — и заметить это было бы нечем.
    expect(report.changes.repairs).toEqual([]);
  });

  it('повторный запуск не удваивает данные', async () => {
    const before = {
      users: await db.prisma.user.count(),
      clubs: await db.prisma.club.count(),
      trainers: await db.prisma.trainer.count(),
      offerings: await db.prisma.offering.count(),
      schedule: await db.prisma.schedule.count(),
      clubSports: await db.prisma.clubSport.count(),
      trainerSpecialties: await db.prisma.trainerSpecialty.count(),
      favorites: await db.prisma.userFavoriteClub.count(),
    };

    await seedDevData({ client: db.prisma, today: TODAY });

    expect({
      users: await db.prisma.user.count(),
      clubs: await db.prisma.club.count(),
      trainers: await db.prisma.trainer.count(),
      offerings: await db.prisma.offering.count(),
      schedule: await db.prisma.schedule.count(),
      clubSports: await db.prisma.clubSport.count(),
      trainerSpecialties: await db.prisma.trainerSpecialty.count(),
      favorites: await db.prisma.userFavoriteClub.count(),
    }).toEqual(before);
  });

  it('счётчики номеров подняты — следующая публикация не садится на занятый номер', async () => {
    const club = await db.prisma.club.create({
      data: {
        name: 'Новый клуб',
        slug: 'novyy-klub',
        slugNormalized: 'novyy-klub',
        description: '',
        shortDescription: '',
        city: 'Самара',
        address: '',
        phone: '',
        latitude: 0,
        longitude: 0,
      },
    });

    // Число зависит от размера сида, поэтому сверяется не с литералом, а с фактом:
    // новый клуб не сел на занятый номер. Иначе тест приходилось бы править
    // при каждом пополнении сида, и он перестал бы что-либо стеречь.
    const seeded = await db.prisma.club.count({ where: { id: { not: club.id } } });

    expect(club.id, 'счётчик номеров не поднят — публикация села на занятый номер').toBeGreaterThan(
      seeded - 1,
    );

    await db.prisma.club.delete({ where: { id: club.id } });
  });
});
