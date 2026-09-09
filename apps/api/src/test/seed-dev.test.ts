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
import { DEV_PASSWORD, seedDevData } from '../storage/seed/dev-seed';
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
    expect(await db.prisma.club.count()).toBe(3);
    expect(await db.prisma.trainer.count()).toBe(2);

    const link = await db.prisma.trainerClubLink.findFirstOrThrow();

    expect(link.status).toBe('confirmed');
    expect(link.trainerId).toBe(1);
    expect(link.clubId).toBe(1);
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

  it('занятия лежат в будущем — иначе записаться на них нельзя с первой минуты', async () => {
    const slots = await db.prisma.schedule.findMany({ orderBy: { id: 'asc' } });

    expect(slots.length).toBeGreaterThanOrEqual(3);

    for (const slot of slots) {
      expect(slot.date.getTime(), `слот ${slot.id}`).toBeGreaterThan(TODAY.getTime());
      expect(slot.bookedCount).toBe(0);
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
