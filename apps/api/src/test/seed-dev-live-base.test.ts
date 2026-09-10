// Сид на НЕПУСТОЙ базе (шаг 36.33).
//
// Долг, записанный в `STACK_OVERVIEW.md`: `npm run db:seed` не отрабатывает на живой
// базе. Прежний сид писал строки «вставить или обновить» ПО НОМЕРУ и молча полагался
// на то, что нумерация начнётся с единицы. На живой базе номер 1 принадлежит другому
// человеку, а почта, которую сид хочет занять, уже занята третьим номером — и вся
// вставка падала на уникальном индексе почты.
//
// Проверено на копии живой базы 10.09.2026 (снимок `sporthub` → отдельная база):
//   Unique constraint failed on the fields: (`email`)
// А когда конфликт почты убирали, сид доходил до конца и ЗАТИРАЛ живые строки:
// «Алексей Смирнов» становился «Администратором SportHub», клуб «Самарская федерация
// Айкидо ёшинкан» — «Фитнес-центром «Ритм»». Второе хуже первого: падение видно,
// затирание — нет. Его стережёт соседний файл `seed-dev-keeps-live-edits.test.ts`.
//
// Здесь проверяется первая половина обещания: сид ДОХОДИТ до конца на базе, где
// младшие номера заняты, а часть его естественных ключей уже присутствует, и повтор
// ничего не задваивает.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedDevData } from '../storage/seed/dev-seed';

import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

/** Опорный день фиксирован: иначе «занятия в будущем» зависели бы от часа прогона. */
const TODAY = new Date('2026-08-20T00:00:00.000Z');

/** Клуб сида, на который ссылается избранное демонстрационного атлета. */
const SEEDED_CLUB_SLUG = 'fitnes-centr-ritm';

let db: TestDatabase;

/**
 * Живая база: то, что сид застаёт на машине, где площадкой уже пользовались.
 *
 * Три обстоятельства воспроизведены намеренно, все три сняты с живой базы:
 *   1. младшие номера заняты чужими строками — нумерация НЕ начинается с единицы;
 *   2. почта сида уже принадлежит ДРУГОМУ номеру — на этом сид и падал;
 *   3. часть справочников уже заполнена — теги и города совпадают по названию.
 */
async function arrangeLiveBase(): Promise<void> {
  await db.prisma.user.createMany({
    data: [
      {
        name: 'Алексей Смирнов',
        email: 'alexey@live.local',
        phone: '+7 (900) 111-11-11',
        passwordHash: '$argon2id$живой-человек-1',
        city: 'Самара',
      },
      {
        name: 'Марина Крылова',
        email: 'marina@live.local',
        phone: '+7 (900) 111-11-12',
        passwordHash: '$argon2id$живой-человек-2',
        city: 'Самара',
      },
      {
        // ⚠️ Тот самый случай: почта сида занята, но НЕ тем номером, который сид
        // собирался ей выдать. Прежний сид падал ровно здесь.
        name: 'Администратор прежнего стенда',
        email: 'admin@sporthub.local',
        phone: '+7 (900) 111-11-13',
        passwordHash: '$argon2id$живой-человек-3',
        accountKind: 'admin',
        city: 'Самара',
      },
    ],
  });

  const [alexey] = await db.prisma.user.findMany({ where: { email: 'alexey@live.local' } });

  await db.prisma.club.create({
    data: {
      name: 'Самарская федерация Айкидо ёшинкан',
      slug: 'zhivoy-klub-goroda',
      slugNormalized: 'zhivoy-klub-goroda',
      description: 'Живой клуб живого человека.',
      shortDescription: 'Живой клуб',
      city: 'Самара',
      address: 'ул. Живая, 1',
      phone: '+7 (846) 111-11-11',
      latitude: 53.2,
      longitude: 50.1,
      managedByUserId: alexey.id,
    },
  });

  await db.prisma.trainer.create({
    data: {
      name: 'Живой тренер',
      slug: 'zhivoy-trener',
      slugNormalized: 'zhivoy-trener',
      bio: 'Карточка живого человека.',
      experienceYears: 5,
      managedByUserId: alexey.id,
    },
  });

  // Справочники, уже заполненные до сида. Названия совпадают с набором сида —
  // значит сид обязан ими воспользоваться, а не завести вторые с теми же именами.
  await db.prisma.city.create({
    data: { name: 'Самара', nameNormalized: 'самара', latitude: 1, longitude: 1 },
  });
  await db.prisma.tag.create({ data: { name: 'Для начинающих' } });
}

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();

  await db.truncateAll();
  await arrangeLiveBase();
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe('Сид на непустой базе', () => {
  it('доходит до конца, когда младшие номера заняты, а почта сида — за другим номером', async () => {
    // Прежний сид падал здесь на уникальном индексе почты: он писал строку
    // «вставить или обновить» по номеру 1 и пытался выдать ей почту, занятую номером 3.
    await expect(seedDevData({ client: db.prisma, today: TODAY })).resolves.toBeDefined();
  });

  it('завёл свои учётные записи по одной на почту и не тронул живые', async () => {
    const seeded = await db.prisma.user.findMany({
      where: { email: { in: ['owner@sporthub.local', 'trainer@sporthub.local'] } },
    });

    expect(seeded).toHaveLength(2);

    // Почта администратора была занята живым человеком — сид её не отбирает.
    const admins = await db.prisma.user.findMany({ where: { email: 'admin@sporthub.local' } });

    expect(admins).toHaveLength(1);
    expect(admins[0].name, 'живой администратор переписан набором сида').toBe(
      'Администратор прежнего стенда',
    );

    const alexey = await db.prisma.user.findFirstOrThrow({ where: { email: 'alexey@live.local' } });

    expect(alexey.name).toBe('Алексей Смирнов');
  });

  it('не садится на занятые номера — публикации сида получают свои', async () => {
    const liveClub = await db.prisma.club.findFirstOrThrow({
      where: { slugNormalized: 'zhivoy-klub-goroda' },
    });

    expect(liveClub.name, 'живой клуб переписан клубом сида').toBe(
      'Самарская федерация Айкидо ёшинкан',
    );

    const seededClub = await db.prisma.club.findFirstOrThrow({
      where: { slugNormalized: SEEDED_CLUB_SLUG },
    });

    expect(seededClub.id, 'клуб сида сел на номер живого клуба').not.toBe(liveClub.id);
    expect(seededClub.name).toBe('Фитнес-центр «Ритм»');
  });

  it('не заводит вторых строк справочника с тем же названием', async () => {
    expect(await db.prisma.tag.count({ where: { name: 'Для начинающих' } })).toBe(1);
    expect(await db.prisma.city.count({ where: { nameNormalized: 'самара' } })).toBe(1);
  });

  it('связал публикации с УЖЕ существующими строками справочника', async () => {
    // Главная проверка пересчёта номеров: тег «Для начинающих» лежал в базе до сида
    // и получил номер, которого в наборе сида нет вовсе. Клуб сида обязан ссылаться
    // на него, а не на номер из набора.
    const tag = await db.prisma.tag.findFirstOrThrow({ where: { name: 'Для начинающих' } });
    const club = await db.prisma.club.findFirstOrThrow({
      where: { slugNormalized: SEEDED_CLUB_SLUG },
      include: { tags: true },
    });

    expect(club.tags.map((link) => link.tagId)).toContain(tag.id);
  });

  it('избранное атлета указывает на клуб сида, а не на живой клуб с тем же номером', async () => {
    // В наборе избранное записано номером 1 — на живой базе этот номер принадлежит
    // чужому клубу. Если номера не пересчитывать, атлет получает в избранное
    // чужую публикацию, и заметить это нечем.
    const athlete = await db.prisma.user.findFirstOrThrow({
      where: { email: 'athlete@sporthub.local' },
      include: { favoriteClubs: { include: { club: true } } },
    });

    expect(athlete.favoriteClubs).toHaveLength(1);
    expect(athlete.favoriteClubs[0].club.slugNormalized).toBe(SEEDED_CLUB_SLUG);
  });

  it('услуга тренера собрана «в зале клуба» на номерах, которые выдала база', async () => {
    const offering = await db.prisma.offering.findFirstOrThrow({
      where: { ownerTrainerId: { not: null }, title: 'Пилатес — индивидуально' },
      include: { venueClub: true, trainerClubLink: true },
    });

    expect(offering.venueClub?.slugNormalized).toBe(SEEDED_CLUB_SLUG);
    expect(offering.trainerClubLink?.status).toBe('confirmed');
  });

  it('повторный прогон на той же базе не падает и ничего не задваивает', async () => {
    const before = await countEverything();

    await expect(seedDevData({ client: db.prisma, today: TODAY })).resolves.toBeDefined();

    expect(await countEverything()).toEqual(before);
  });
});

/** Счётчики всех таблиц, которые наполняет сид. Считает база, а не тест. */
async function countEverything(): Promise<Record<string, number>> {
  return {
    cities: await db.prisma.city.count(),
    sports: await db.prisma.sport.count(),
    tags: await db.prisma.tag.count(),
    amenities: await db.prisma.amenity.count(),
    specialties: await db.prisma.specialty.count(),
    workFormats: await db.prisma.workFormat.count(),
    users: await db.prisma.user.count(),
    clubs: await db.prisma.club.count(),
    trainers: await db.prisma.trainer.count(),
    trainerClubLinks: await db.prisma.trainerClubLink.count(),
    offerings: await db.prisma.offering.count(),
    schedule: await db.prisma.schedule.count(),
    clubSports: await db.prisma.clubSport.count(),
    clubTags: await db.prisma.clubTag.count(),
    clubAmenities: await db.prisma.clubAmenity.count(),
    trainerSports: await db.prisma.trainerSport.count(),
    trainerSpecialties: await db.prisma.trainerSpecialty.count(),
    trainerWorkFormats: await db.prisma.trainerWorkFormat.count(),
    favorites: await db.prisma.userFavoriteClub.count(),
  };
}
