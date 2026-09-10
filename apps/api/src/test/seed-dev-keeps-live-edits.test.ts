// Сид НЕ перезаписывает живые данные (шаг 36.34, диверсия д-18).
//
// Почему это отдельный файл, а не ещё один случай в проверке идемпотентности.
// Сид, который падает на живой базе, плох тем, что мешает поднять стенд. Сид,
// который доходит до конца и по дороге затирает живые строки, ХУЖЕ: падение
// видно сразу, а затирание — нет. Проверка «повторный прогон не задваивает»
// на затирающем сиде остаётся ЗЕЛЁНОЙ: строк по-прежнему столько же, просто
// содержимое у них теперь чужое.
//
// Замерено на копии живой базы 10.09.2026: прежний сид писал строки «вставить или
// обновить» по номеру, и после прогона «Алексей Смирнов» становился
// «Администратором SportHub», а клуб «Самарская федерация Айкидо ёшинкан» —
// «Фитнес-центром «Ритм»».
//
// Здесь заводятся строки с ТЕМИ ЖЕ естественными ключами, что у набора сида, но
// с полями, изменёнными человеком. После сида все правки обязаны остаться на месте.
// Диверсия: заменить «пропустить конфликт» на «обновить при конфликте» —
// этот файл обязан покраснеть.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedDevData } from '../storage/seed/dev-seed';

import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

const TODAY = new Date('2026-08-20T00:00:00.000Z');

/** Хеш пароля живого человека: сид обязан оставить его нетронутым. */
const LIVE_PASSWORD_HASH = '$argon2id$пароль-живого-человека';

let db: TestDatabase;

/**
 * Живая база, где по естественным ключам сида УЖЕ лежат строки, правленные человеком.
 *
 * Каждое поле здесь отличается от набора сида намеренно: по нему и видно,
 * перезаписал сид строку или прошёл мимо.
 */
async function arrangeEditedRows(): Promise<void> {
  await db.prisma.user.create({
    data: {
      // Ключ тот же, что у сида. Всё остальное — правка человека.
      email: 'owner@sporthub.local',
      name: 'Ольга Владелец (сменила фамилию)',
      phone: '+7 (900) 999-99-99',
      passwordHash: LIVE_PASSWORD_HASH,
      city: 'Тольятти',
      status: 'suspended',
    },
  });

  const owner = await db.prisma.user.findFirstOrThrow({
    where: { email: 'owner@sporthub.local' },
  });

  const club = await db.prisma.club.create({
    data: {
      slug: 'fitnes-centr-ritm',
      slugNormalized: 'fitnes-centr-ritm',
      name: 'Ритм после ребрендинга',
      description: 'Описание, переписанное владельцем.',
      shortDescription: 'Переписанное краткое описание',
      city: 'Тольятти',
      address: 'ул. Переехали, 7',
      phone: '+7 (846) 999-99-99',
      latitude: 53.5,
      longitude: 49.4,
      priceFrom: 4200,
      status: 'hidden',
      managedByUserId: owner.id,
    },
  });

  // Свой вид спорта у живого клуба: сид не должен дописывать клубу свои.
  const sport = await db.prisma.sport.create({
    data: {
      name: 'Йога',
      slug: 'yoga',
      description: 'Описание, переписанное человеком.',
      icon: '🙏',
      imageUrl: '/images/sports/yoga-live.jpg',
      isPopular: false,
    },
  });

  await db.prisma.clubSport.create({ data: { clubId: club.id, sportId: sport.id } });

  await db.prisma.trainer.create({
    data: {
      slug: 'mariya-orlova',
      slugNormalized: 'mariya-orlova',
      name: 'Мария Орлова',
      bio: 'Биография, переписанная самой Марией.',
      experienceYears: 22,
      priceFrom: 3300,
      managedByUserId: owner.id,
    },
  });

  await db.prisma.city.create({
    // Ключ города — нормализованное имя. Правка человека здесь в координатах:
    // их однажды уточнили руками, и сид не вправе вернуть прежние.
    data: { name: 'Самара', nameNormalized: 'самара', latitude: 53.111111, longitude: 50.222222 },
  });
}

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();

  await db.truncateAll();
  await arrangeEditedRows();

  await seedDevData({ client: db.prisma, today: TODAY });
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe('Сид не перезаписывает живые данные', () => {
  it('оставляет человеку его имя, телефон, город, состояние и пароль', async () => {
    const owner = await db.prisma.user.findFirstOrThrow({
      where: { email: 'owner@sporthub.local' },
    });

    expect(owner.name).toBe('Ольга Владелец (сменила фамилию)');
    expect(owner.phone).toBe('+7 (900) 999-99-99');
    expect(owner.city).toBe('Тольятти');
    expect(owner.status).toBe('suspended');
    // Пароль — самое дорогое из перезаписываемого: сид знает свой демонстрационный
    // и подменил бы им живой, после чего человек перестал бы входить.
    expect(owner.passwordHash).toBe(LIVE_PASSWORD_HASH);
  });

  it('оставляет клубу переписанные владельцем поля и его состояние', async () => {
    const club = await db.prisma.club.findFirstOrThrow({
      where: { slugNormalized: 'fitnes-centr-ritm' },
    });

    expect(club.name).toBe('Ритм после ребрендинга');
    expect(club.description).toBe('Описание, переписанное владельцем.');
    expect(club.phone).toBe('+7 (846) 999-99-99');
    expect(club.city).toBe('Тольятти');
    expect(club.priceFrom).toBe(4200);
    // Скрытая публикация, возвращённая сидом в каталог, — это уже не «данные»,
    // а отменённое решение человека.
    expect(club.status).toBe('hidden');
  });

  it('не дописывает живому клубу своих видов спорта, тегов и удобств', async () => {
    const club = await db.prisma.club.findFirstOrThrow({
      where: { slugNormalized: 'fitnes-centr-ritm' },
      include: { sports: true, tags: true, amenities: true },
    });

    expect(club.sports).toHaveLength(1);
    expect(club.tags).toHaveLength(0);
    expect(club.amenities).toHaveLength(0);
  });

  it('оставляет карточке тренера переписанную биографию и цену', async () => {
    const trainer = await db.prisma.trainer.findFirstOrThrow({
      where: { slugNormalized: 'mariya-orlova' },
    });

    expect(trainer.bio).toBe('Биография, переписанная самой Марией.');
    expect(trainer.experienceYears).toBe(22);
    expect(trainer.priceFrom).toBe(3300);
  });

  it('оставляет справочникам уточнённые человеком значения', async () => {
    const city = await db.prisma.city.findFirstOrThrow({ where: { nameNormalized: 'самара' } });

    expect(city.latitude).toBe(53.111111);
    expect(city.longitude).toBe(50.222222);

    const sport = await db.prisma.sport.findFirstOrThrow({ where: { slug: 'yoga' } });

    expect(sport.description).toBe('Описание, переписанное человеком.');
    expect(sport.icon).toBe('🙏');
    expect(sport.isPopular).toBe(false);
  });

  it('при этом всё-таки дописывает недостающее', async () => {
    // Страховка от обратной ошибки: сид, который не делает НИЧЕГО, прошёл бы
    // все проверки выше. Значит проверяем и то, что он работает.
    const balance = await db.prisma.club.findFirst({
      where: { slugNormalized: 'studiya-balans' },
    });

    expect(balance, 'сид не завёл недостающий клуб').not.toBeNull();

    const athlete = await db.prisma.user.findFirst({
      where: { email: 'athlete@sporthub.local' },
    });

    expect(athlete, 'сид не завёл недостающего человека').not.toBeNull();
  });
});
