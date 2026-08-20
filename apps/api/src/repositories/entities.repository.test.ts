// Тесты репозиториев клубов, тренеров и расписания.
//
// Контрактный набор прогоняется на ОБЕИХ реализациях — файловой и на базе. Совпадение
// результатов и есть доказательство переезда: интерфейс репозитория не изменился
// ни на одну сигнатуру, значит сервисы и их тесты трогать не пришлось.
//
// Проверок на конкретный номер здесь нет намеренно. Номера выдаёт хранилище, и у базы
// это последовательность, а не «максимальный плюс один»: дырки в нумерации
// переиспользовать нельзя, они уже могли утечь в ссылки и в журнал. Поэтому проверяется
// свойство — «номер новый» и «номер тот же, что вернула вставка».
//
// Отдельными блоками идёт то, что у реализаций РАЗНОЕ и разное намеренно:
// починки данных файлового хранилища (их место — там, где лежат сами кривые данные)
// и порядок наборов ссылок в базе (у связующих таблиц нет колонки позиции).

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Club, Offering, Schedule, Trainer } from '@sporthub/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { JsonStorage } from '../storage/json-storage';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';
import { createTestDatabase, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import {
  JsonClubsRepository,
  JsonScheduleRepository,
  JsonTrainersRepository,
  normalizeSlugLookupValue,
  type ClubsRepository,
  type ScheduleRepository,
  type TrainersRepository,
} from './entities.repository';
import {
  PrismaClubsRepository,
  PrismaScheduleRepository,
  PrismaTrainersRepository,
} from './prisma/entities.repository';

// --- Общий сид ----------------------------------------------------------------
//
// Один и тот же набор данных ложится и в файлы, и в базу. Номера проставлены явно:
// иначе две реализации разошлись бы уже на сиде, и сравнивать было бы нечего.

const SPORT_IDS = [1, 2, 3, 5, 7, 8];
const TAG_IDS = [1, 2, 3];
const AMENITY_IDS = [1, 2, 3];
const SPECIALTY_IDS = [1, 2, 3];
const WORK_FORMAT_IDS = [1, 2];

const SEED_CLUBS: Club[] = [
  {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Кроссфит',
    slug: 'кроссфит',
    description: 'Полное описание клуба',
    shortDescription: 'Кратко о клубе',
    city: 'Самара',
    address: 'ул. Ленина, 1',
    phone: '+7 900 000-00-01',
    email: 'club@example.com',
    website: 'https://example.com',
    coordinates: { lat: 53.2, lng: 50.1 },
    sportIds: [1, 7],
    imageUrls: ['/photo-a.jpg', '/photo-b.jpg'],
    amenityIds: [1, 3],
    tagIds: [2],
    rating: 4.5,
    reviewCount: 2,
    priceFrom: 1000,
    distanceKm: 1.2,
    source: 'provider',
    status: 'published',
  },
  {
    id: 2,
    createdAt: '2026-01-02T00:00:00.000Z',
    name: 'Скрытый',
    slug: 'hidden',
    description: 'Описание скрытого клуба',
    shortDescription: 'Скрыт',
    city: 'Самара',
    address: 'ул. Полевая, 2',
    phone: '+7 900 000-00-02',
    coordinates: { lat: 53.3, lng: 50.2 },
    sportIds: [],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 0,
    distanceKm: 0,
    source: 'seed',
    status: 'hidden',
    hideReason: 'Жалоба пользователей',
    hiddenAt: '2026-01-03T00:00:00.000Z',
  },
];

const SEED_TRAINERS: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Пётр',
    slug: 'пётр',
    bio: 'Биография тренера',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [1, 2],
    workFormatIds: [1],
    rating: 4.8,
    reviewCount: 3,
    priceFrom: 1500,
    // Без явного основного вида спорта: он обязан вывестись из первого в списке.
    sportIds: [3, 5],
    city: 'Самара',
    address: 'ул. Мичурина, 3',
    coordinates: { lat: 53.21, lng: 50.15 },
    phone: '+7 900 000-00-11',
    source: 'provider',
    status: 'published',
  },
  {
    id: 2,
    createdAt: '2026-01-02T00:00:00.000Z',
    name: 'Скрытая',
    slug: 'скрытая',
    bio: 'Биография',
    avatarUrl: '',
    experienceYears: 1,
    specialtyIds: [],
    workFormatIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 0,
    // Явно названный основной вид спорта НЕ первый в списке — он главнее списка.
    sportIds: [5, 8],
    sportId: 8,
    source: 'seed',
    status: 'hidden',
  },
];

const SEED_OFFERINGS: Offering[] = [
  {
    id: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    ownerType: 'trainer',
    ownerId: 1,
    sportId: 3,
    title: 'Персональная',
    description: 'Персональное занятие',
    format: 'personal',
    price: 1500,
    durationMinutes: 60,
    capacity: 1,
    address: 'ул. Мичурина, 3',
    coordinates: { lat: 53.21, lng: 50.15 },
  },
  {
    id: 11,
    createdAt: '2026-01-01T00:00:00.000Z',
    ownerType: 'club',
    ownerId: 1,
    sportId: 7,
    title: 'Групповая',
    description: 'Групповое занятие',
    format: 'group',
    price: 800,
    durationMinutes: 60,
    capacity: 10,
    address: 'ул. Ленина, 1',
    coordinates: { lat: 53.2, lng: 50.1 },
  },
];

const SEED_SCHEDULE: Schedule[] = [
  // Тренерский слот в зале клуба: владелец — тренер, площадка — клуб.
  {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    offeringId: 10,
    ownerType: 'trainer',
    ownerId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Персональная',
    date: '2026-03-01',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 5,
    bookedCount: 0,
    price: 1500,
  },
  // Клубный слот.
  {
    id: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    offeringId: 11,
    ownerType: 'club',
    ownerId: 1,
    clubId: 1,
    sportId: 7,
    title: 'Групповая',
    date: '2026-03-02',
    startTime: '18:30',
    endTime: '19:30',
    durationMinutes: 60,
    level: 'beginner',
    capacity: 10,
    bookedCount: 1,
    price: 800,
    room: 'Зал 1',
  },
  // Тренерский слот без зала: клуба у него нет вовсе.
  {
    id: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    offeringId: 10,
    ownerType: 'trainer',
    ownerId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Выездная',
    date: '2026-03-03',
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 1,
    bookedCount: 0,
    price: 1500,
  },
];

/** Заготовка нового слота: полей у слота много, а меняется в проверках одно-два. */
const newSlot = (patch: Partial<Schedule>): Omit<Schedule, 'id' | 'createdAt'> =>
  ({
    offeringId: 11,
    ownerType: 'club',
    ownerId: 1,
    clubId: 1,
    sportId: 7,
    title: 'Новый',
    date: '2026-04-01',
    startTime: '08:00',
    endTime: '09:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 8,
    bookedCount: 0,
    price: 700,
    ...patch,
  }) as Omit<Schedule, 'id' | 'createdAt'>;

/** Заготовка нового клуба. */
const newClub = (patch: Partial<Club>): Omit<Club, 'id' | 'createdAt'> =>
  ({
    name: 'Новый клуб',
    slug: 'новый-клуб',
    description: 'Описание',
    shortDescription: 'Кратко',
    city: 'Самара',
    address: 'ул. Новая, 1',
    phone: '+7 900 000-00-99',
    coordinates: { lat: 53.0, lng: 50.0 },
    sportIds: [2, 8],
    imageUrls: ['/new.jpg'],
    amenityIds: [2],
    tagIds: [1, 3],
    rating: 0,
    reviewCount: 0,
    priceFrom: 500,
    distanceKm: 0,
    source: 'provider',
    status: 'published',
    ...patch,
  }) as Omit<Club, 'id' | 'createdAt'>;

/** Заготовка нового тренера. */
const newTrainer = (patch: Partial<Trainer>): Omit<Trainer, 'id' | 'createdAt'> =>
  ({
    name: 'Новый тренер',
    slug: 'новый-тренер',
    bio: 'Биография',
    avatarUrl: '',
    experienceYears: 2,
    specialtyIds: [3],
    workFormatIds: [1, 2],
    rating: 0,
    reviewCount: 0,
    priceFrom: 900,
    sportIds: [2, 8],
    ...patch,
  }) as Omit<Trainer, 'id' | 'createdAt'>;

// --- Контрактные наборы -------------------------------------------------------

const clubsContract = (createRepository: () => Promise<ClubsRepository>) => {
  it('findAll отдаёт клубы в устойчивом порядке номеров', async () => {
    const clubs = await createRepository();

    expect((await clubs.findAll()).map((club) => club.id)).toEqual([1, 2]);
  });

  it('фильтр скрытых убирает только status=hidden', async () => {
    const clubs = await createRepository();

    expect(await clubs.findAll()).toHaveLength(2);
    expect(await clubs.findAll({ excludeHidden: true })).toHaveLength(1);
  });

  it('findById собирает наборы ссылок, галерею и координаты', async () => {
    const clubs = await createRepository();

    const club = await clubs.findById(1);

    expect(club).toMatchObject({
      name: 'Кроссфит',
      city: 'Самара',
      email: 'club@example.com',
      coordinates: { lat: 53.2, lng: 50.1 },
      sportIds: [1, 7],
      amenityIds: [1, 3],
      tagIds: [2],
      imageUrls: ['/photo-a.jpg', '/photo-b.jpg'],
      rating: 4.5,
      status: 'published',
    });
    // Ключа нет вовсе, а не «есть и пустой»: сверка контрактов видит разницу.
    expect(club && 'hideReason' in club).toBe(false);
  });

  it('findById несуществующего клуба отдаёт null', async () => {
    const clubs = await createRepository();

    expect(await clubs.findById(999)).toBeNull();
  });

  it('находит клуб по кириллическому slug, его encoded-версии и другому регистру', async () => {
    const clubs = await createRepository();

    expect(await clubs.findBySlug('кроссфит')).toMatchObject({ id: 1 });
    expect(await clubs.findBySlug(encodeURIComponent('кроссфит'))).toMatchObject({ id: 1 });
    expect(await clubs.findBySlug('КРОССФИТ')).toMatchObject({ id: 1 });
  });

  it('несуществующий slug отдаёт null', async () => {
    const clubs = await createRepository();

    expect(await clubs.findBySlug('нет-такого')).toBeNull();
    expect(await clubs.findBySlug('  ')).toBeNull();
  });

  it('insert выдаёт новый номер, метку времени и сохраняет наборы ссылок', async () => {
    const clubs = await createRepository();
    const before = await clubs.findAll();

    const created = await clubs.insert(newClub({}));

    expect(before.map((club) => club.id)).not.toContain(created.id);
    expect(() => new Date(created.createdAt).toISOString()).not.toThrow();
    expect(created).toMatchObject({
      name: 'Новый клуб',
      sportIds: [2, 8],
      tagIds: [1, 3],
      amenityIds: [2],
      imageUrls: ['/new.jpg'],
    });
    // Тот же номер обязан находиться повторным чтением, а не только вернуться разово.
    expect(await clubs.findById(created.id)).toMatchObject({ id: created.id });
  });

  it('вставленный клуб находится по своему адресу-ссылке, включая кириллицу', async () => {
    const clubs = await createRepository();

    const created = await clubs.insert(newClub({ slug: 'НовыйКлуб' }));

    expect(await clubs.findBySlug('новыйклуб')).toMatchObject({ id: created.id });
  });

  it('update меняет только переданные поля', async () => {
    const clubs = await createRepository();

    const updated = await clubs.update(1, { name: 'Кроссфит 2.0', priceFrom: 1200 });

    expect(updated).toMatchObject({
      id: 1,
      name: 'Кроссфит 2.0',
      priceFrom: 1200,
      city: 'Самара',
      sportIds: [1, 7],
    });
  });

  it('update набора ссылок добавляет и убирает, а не переписывает целиком', async () => {
    const clubs = await createRepository();

    const updated = await clubs.update(1, { sportIds: [1, 2], tagIds: [], amenityIds: [1, 2, 3] });

    expect(updated.sportIds).toEqual([1, 2]);
    expect(updated.tagIds).toEqual([]);
    expect(updated.amenityIds).toEqual([1, 2, 3]);
    expect((await clubs.findById(1))?.sportIds).toEqual([1, 2]);
  });

  it('update галереи меняет, укорачивает и удлиняет список кадров', async () => {
    const clubs = await createRepository();

    const replaced = await clubs.update(1, { imageUrls: ['/photo-a.jpg', '/photo-c.jpg'] });
    expect(replaced.imageUrls).toEqual(['/photo-a.jpg', '/photo-c.jpg']);

    const shortened = await clubs.update(1, { imageUrls: ['/photo-c.jpg'] });
    expect(shortened.imageUrls).toEqual(['/photo-c.jpg']);

    const grown = await clubs.update(1, { imageUrls: ['/photo-c.jpg', '/photo-d.jpg', '/e.jpg'] });
    expect(grown.imageUrls).toEqual(['/photo-c.jpg', '/photo-d.jpg', '/e.jpg']);
  });

  it('правка с пустым значением стирает причину скрытия', async () => {
    const clubs = await createRepository();

    const updated = await clubs.update(2, {
      status: 'published',
      hideReason: undefined,
      hiddenAt: undefined,
    });

    expect(updated.status).toBe('published');
    // Проверяется ЗНАЧЕНИЕ, а не наличие ключа: файловая реализация собирает ответ
    // расширением объекта, и ключ со значением `undefined` у неё остаётся в памяти.
    // Наружу он всё равно не уходит — сериализация его выбрасывает, — а вот
    // ПЕРЕЧИТАННАЯ запись обязана быть без ключа у обеих реализаций.
    expect(updated.hideReason).toBeUndefined();
    expect(updated.hiddenAt).toBeUndefined();

    const reread = await clubs.findById(2);
    expect(reread && 'hideReason' in reread).toBe(false);
    expect(reread && 'hiddenAt' in reread).toBe(false);
  });

  it('смена адреса-ссылки переносит и поиск по нему', async () => {
    const clubs = await createRepository();

    await clubs.update(1, { slug: 'КроссФит-Новый' });

    expect(await clubs.findBySlug('кроссфит')).toBeNull();
    expect(await clubs.findBySlug('кроссфит-новый')).toMatchObject({ id: 1 });
  });

  it('обновление несуществующего клуба бросает текст с id — как в db.ts', async () => {
    const clubs = await createRepository();

    await expect(clubs.update(999, { name: 'x' })).rejects.toThrow('Клуб с id 999 не найден');
  });

  it('remove удаляет клуб, повторное удаление не считается ошибкой', async () => {
    const clubs = await createRepository();

    await clubs.remove(2);
    expect(await clubs.findById(2)).toBeNull();
    await expect(clubs.remove(2)).resolves.toBeUndefined();
    expect(await clubs.findAll()).toHaveLength(1);
  });
};

const trainersContract = (createRepository: () => Promise<TrainersRepository>) => {
  it('findAll отдаёт тренеров в устойчивом порядке номеров', async () => {
    const trainers = await createRepository();

    expect((await trainers.findAll()).map((trainer) => trainer.id)).toEqual([1, 2]);
  });

  it('фильтр скрытых убирает только status=hidden', async () => {
    const trainers = await createRepository();

    expect(await trainers.findAll()).toHaveLength(2);
    expect(await trainers.findAll({ excludeHidden: true })).toHaveLength(1);
  });

  it('findById собирает наборы ссылок и координаты', async () => {
    const trainers = await createRepository();

    expect(await trainers.findById(1)).toMatchObject({
      name: 'Пётр',
      specialtyIds: [1, 2],
      workFormatIds: [1],
      coordinates: { lat: 53.21, lng: 50.15 },
      experienceYears: 5,
    });
  });

  it('у тренера без своей точки координат нет вовсе, а не «пустые»', async () => {
    const trainers = await createRepository();

    const trainer = await trainers.findById(2);

    expect(trainer && 'coordinates' in trainer).toBe(false);
    expect(trainer && 'city' in trainer).toBe(false);
  });

  it('основной вид спорта выводится из первого в списке, когда своего нет', async () => {
    const trainers = await createRepository();

    const trainer = await trainers.findById(1);

    expect(trainer?.sportIds).toEqual([3, 5]);
    expect(trainer?.sportId).toBe(3);
  });

  it('явно названный основной вид спорта главнее первого в списке', async () => {
    const trainers = await createRepository();

    const trainer = await trainers.findById(2);

    expect(trainer?.sportIds).toEqual([5, 8]);
    expect(trainer?.sportId).toBe(8);
  });

  it('находит тренера по кириллическому slug, encoded-версии и другому регистру', async () => {
    const trainers = await createRepository();

    expect(await trainers.findBySlug('пётр')).toMatchObject({ id: 1 });
    expect(await trainers.findBySlug(encodeURIComponent('пётр'))).toMatchObject({ id: 1 });
    expect(await trainers.findBySlug('ПЁТР')).toMatchObject({ id: 1 });
    expect(await trainers.findBySlug('нет-такого')).toBeNull();
    expect(await trainers.findBySlug('  ')).toBeNull();
  });

  it('insert выдаёт новый номер и сохраняет наборы ссылок', async () => {
    const trainers = await createRepository();
    const before = await trainers.findAll();

    const created = await trainers.insert(newTrainer({}));

    expect(before.map((trainer) => trainer.id)).not.toContain(created.id);
    expect(created).toMatchObject({
      name: 'Новый тренер',
      sportIds: [2, 8],
      specialtyIds: [3],
      workFormatIds: [1, 2],
    });
    expect(await trainers.findById(created.id)).toMatchObject({ id: created.id });
  });

  it('правка списка видов спорта не двигает явно названный основной', async () => {
    const trainers = await createRepository();

    const updated = await trainers.update(2, { sportIds: [1, 2, 5] });

    expect(updated.sportIds).toEqual([1, 2, 5]);
    // Основной остаётся тем, который назвали явно: тренер с исторически заданным
    // видом не переезжает на другой при пополнении списка.
    expect(updated.sportId).toBe(8);
  });

  it('правка списка видов спорта двигает выведенный основной', async () => {
    const trainers = await createRepository();

    const updated = await trainers.update(1, { sportIds: [7, 2] });

    expect(updated.sportIds.slice().sort((a, b) => a - b)).toEqual([2, 7]);
    expect(updated.sportId).toBe(updated.sportIds[0]);
  });

  it('обновление несуществующего тренера бросает текст с id', async () => {
    const trainers = await createRepository();

    await expect(trainers.update(999, { name: 'x' })).rejects.toThrow('Тренер с id 999 не найден');
  });

  it('remove удаляет тренера, повторное удаление не считается ошибкой', async () => {
    const trainers = await createRepository();

    await trainers.remove(2);
    expect(await trainers.findById(2)).toBeNull();
    await expect(trainers.remove(2)).resolves.toBeUndefined();
  });
};

const scheduleContract = (createRepository: () => Promise<ScheduleRepository>) => {
  it('по умолчанию отдаёт только клубные слоты', async () => {
    const schedule = await createRepository();

    const byDefault = await schedule.findMany();

    expect(byDefault).toHaveLength(1);
    expect(byDefault[0].id).toBe(2);
  });

  it('ownerType=all отдаёт все слоты, ownerType=trainer — только тренерские', async () => {
    const schedule = await createRepository();

    expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(3);
    expect((await schedule.findMany({ ownerType: 'trainer' })).map((slot) => slot.id)).toEqual([
      1, 3,
    ]);
  });

  it('владелец тренерского слота собирается вместе с залом-площадкой', async () => {
    const schedule = await createRepository();

    expect(await schedule.findById(1)).toMatchObject({
      ownerType: 'trainer',
      ownerId: 1,
      trainerId: 1,
      clubId: 1,
      offeringId: 10,
    });
  });

  it('у тренерского слота без зала клуба нет вовсе', async () => {
    const schedule = await createRepository();

    const slot = await schedule.findById(3);

    expect(slot).toMatchObject({ ownerType: 'trainer', ownerId: 1, trainerId: 1 });
    // Клуб для тренерского слота здесь НЕ достраивается — это делает потребитель.
    // Проверяется значение: файловая реализация выводит владельца при каждом чтении
    // и оставляет ключ со значением `undefined`, база — не создаёт ключ вовсе.
    // Наружу обе отдают одно и то же: сериализация такой ключ выбрасывает.
    expect(slot?.clubId).toBeUndefined();
  });

  it('у клубного слота клуб — он сам, а тренера нет', async () => {
    const schedule = await createRepository();

    const slot = await schedule.findById(2);

    expect(slot).toMatchObject({ ownerType: 'club', ownerId: 1, clubId: 1, room: 'Зал 1' });
    expect(slot?.trainerId).toBeUndefined();
  });

  it('дата и время остаются строками контракта, а не объектами даты', async () => {
    const schedule = await createRepository();

    const slot = await schedule.findById(2);

    expect(slot?.date).toBe('2026-03-02');
    expect(slot?.startTime).toBe('18:30');
    expect(slot?.endTime).toBe('19:30');
  });

  it('findByOfferingId отдаёт слоты услуги в устойчивом порядке', async () => {
    const schedule = await createRepository();

    expect((await schedule.findByOfferingId(10)).map((slot) => slot.id)).toEqual([1, 3]);
    expect(await schedule.findByOfferingId(999)).toHaveLength(0);
  });

  it('пакетная вставка выдаёт новые номера в порядке входа', async () => {
    const schedule = await createRepository();
    const before = await schedule.findMany({ ownerType: 'all' });

    const created = await schedule.insertMany([
      newSlot({ title: 'Первый', date: '2026-04-01' }),
      newSlot({ title: 'Второй', date: '2026-04-02' }),
    ]);

    expect(created.map((slot) => slot.title)).toEqual(['Первый', 'Второй']);
    expect(created[0].id).toBeLessThan(created[1].id);
    for (const slot of created) {
      expect(before.map((item) => item.id)).not.toContain(slot.id);
    }
    expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(5);
    expect((await schedule.findById(created[1].id))?.date).toBe('2026-04-02');
  });

  it('пустая пакетная вставка ничего не создаёт', async () => {
    const schedule = await createRepository();

    expect(await schedule.insertMany([])).toEqual([]);
    expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(3);
  });

  it('вставка тренерского слота сохраняет и владельца, и зал', async () => {
    const schedule = await createRepository();

    const [created] = await schedule.insertMany([
      newSlot({ ownerType: 'trainer', ownerId: 1, trainerId: 1, clubId: 1, offeringId: 10 }),
    ]);

    expect(await schedule.findById(created.id)).toMatchObject({
      ownerType: 'trainer',
      ownerId: 1,
      trainerId: 1,
      clubId: 1,
    });
  });

  it('update переносит дату и время слота', async () => {
    const schedule = await createRepository();

    const updated = await schedule.update(2, {
      date: '2026-05-06',
      startTime: '07:15',
      endTime: '08:45',
      room: 'Зал 2',
    });

    expect(updated).toMatchObject({
      date: '2026-05-06',
      startTime: '07:15',
      endTime: '08:45',
      room: 'Зал 2',
    });
    expect((await schedule.findById(2))?.date).toBe('2026-05-06');
  });

  it('update не трогает занятые места, если их не передали', async () => {
    const schedule = await createRepository();

    const updated = await schedule.update(2, { title: 'Групповая (вечер)' });

    expect(updated.bookedCount).toBe(1);
  });

  it('обновление несуществующего слота бросает текст с id', async () => {
    const schedule = await createRepository();

    await expect(schedule.update(999, { title: 'x' })).rejects.toThrow('Слот с id 999 не найден');
  });

  it('изменение занятых мест складывается и не уходит ниже нуля', async () => {
    const schedule = await createRepository();

    expect((await schedule.changeBookedCount(2, 2)).bookedCount).toBe(3);
    expect((await schedule.changeBookedCount(2, -5)).bookedCount).toBe(0);
    expect((await schedule.findById(2))?.bookedCount).toBe(0);
  });

  it('изменение занятых мест у несуществующего слота бросает текст с id', async () => {
    const schedule = await createRepository();

    await expect(schedule.changeBookedCount(999, 1)).rejects.toThrow('Слот с id 999 не найден');
  });

  it('removeMany считает только реально удалённое', async () => {
    const schedule = await createRepository();

    expect(await schedule.removeMany([])).toBe(0);
    expect(await schedule.removeMany([1, 3, 999])).toBe(2);
    expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(1);
  });
};

// --- Прогон на файловой реализации --------------------------------------------

describe('Репозитории сущностей каталога', () => {
  let dataDirectory: string;
  let storage: JsonStorage;

  const writeCollection = async (file: string, data: unknown) => {
    await writeFile(path.join(dataDirectory, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  };

  const seedFiles = async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-entities-'));
    storage = new JsonStorage(dataDirectory);
    await writeCollection('clubs.json', SEED_CLUBS);
    await writeCollection('trainers.json', SEED_TRAINERS);
    await writeCollection('offerings.json', SEED_OFFERINGS);
    await writeCollection('schedule.json', SEED_SCHEDULE);
  };

  beforeEach(seedFiles);

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe('нормализация slug', () => {
    it('снимает URI-кодирование, регистр и лишние пробелы', () => {
      expect(normalizeSlugLookupValue('  КроссФит  ')).toBe('кроссфит');
      expect(normalizeSlugLookupValue(encodeURIComponent('кроссфит'))).toBe('кроссфит');
    });

    it('битую кодировку не роняет, а обрабатывает как есть', () => {
      expect(normalizeSlugLookupValue('%E0%A4%A')).toBe('%e0%a4%a');
    });

    it('пустая строка остаётся пустой', () => {
      expect(normalizeSlugLookupValue('   ')).toBe('');
    });
  });

  describe('ClubsRepository — файловая реализация', () => {
    clubsContract(async () => new JsonClubsRepository(storage));
  });

  describe('TrainersRepository — файловая реализация', () => {
    trainersContract(async () => new JsonTrainersRepository(storage));
  });

  describe('ScheduleRepository — файловая реализация', () => {
    scheduleContract(async () => new JsonScheduleRepository(storage));
  });

  // Починки кривых данных — свойство ФАЙЛОВОГО хранилища, а не контракта. В базе
  // их места нет: колонки объявлены, владелец слота обязателен, устаревшего
  // одиночного поля в схеме нет вовсе.
  describe('починки данных файлового хранилища', () => {
    it('восстанавливает sportIds из устаревшего одиночного sportId', async () => {
      await writeCollection('trainers.json', [
        { id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Пётр', slug: 'petr', sportId: 7 },
      ]);

      const trainer = await new JsonTrainersRepository(storage).findById(1);

      expect(trainer?.sportIds).toEqual([7]);
      expect(trainer?.sportId).toBe(7);
    });

    it('без обоих полей отдаёт пустой массив, а не падает', async () => {
      await writeCollection('trainers.json', [
        { id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Пётр', slug: 'petr' },
      ]);

      expect((await new JsonTrainersRepository(storage).findById(1))?.sportIds).toEqual([]);
    });

    it('выводит владельца слота из связанной услуги', async () => {
      await writeCollection('schedule.json', [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          offeringId: 10,
          bookedCount: 0,
          capacity: 5,
        },
      ]);

      const slot = await new JsonScheduleRepository(storage).findById(1);

      expect(slot?.ownerType).toBe('trainer');
      expect(slot?.ownerId).toBe(1);
    });

    it('порядок набора ссылок — порядок записи в файле', async () => {
      const clubs = new JsonClubsRepository(storage);

      const updated = await clubs.update(1, { sportIds: [8, 2] });

      expect(updated.sportIds).toEqual([8, 2]);
    });
  });
});

// --- Прогон на базе -----------------------------------------------------------

describe('Репозитории сущностей каталога — реализация на базе', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  /**
   * Тот же сид, что и у файловой реализации, но разложенный по таблицам.
   * Номера проставляются явно, после чего последовательности двигаются выше
   * максимума — иначе следующий автоматический номер совпал бы с занятым.
   * Ровно то же делает скрипт переноса данных.
   */
  const seedDatabase = async () => {
    await db.truncateAll();

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
    for (const id of TAG_IDS) await db.prisma.tag.create({ data: { id, name: `Тег ${id}` } });
    for (const id of AMENITY_IDS) {
      await db.prisma.amenity.create({ data: { id, name: `Удобство ${id}` } });
    }
    for (const id of SPECIALTY_IDS) {
      await db.prisma.specialty.create({ data: { id, name: `Специализация ${id}` } });
    }
    for (const id of WORK_FORMAT_IDS) {
      await db.prisma.workFormat.create({ data: { id, name: `Формат ${id}` } });
    }

    for (const club of SEED_CLUBS) {
      await db.prisma.club.create({
        data: {
          id: club.id,
          createdAt: new Date(club.createdAt),
          name: club.name,
          slug: club.slug,
          slugNormalized: normalizeSlugLookupValue(club.slug),
          description: club.description,
          shortDescription: club.shortDescription,
          city: club.city,
          address: club.address,
          phone: club.phone,
          email: club.email,
          website: club.website,
          latitude: club.coordinates.lat,
          longitude: club.coordinates.lng,
          rating: club.rating,
          reviewCount: club.reviewCount,
          priceFrom: club.priceFrom,
          distanceKm: club.distanceKm,
          source: club.source,
          status: club.status,
          hideReason: club.hideReason,
          hiddenAt: club.hiddenAt === undefined ? null : new Date(club.hiddenAt),
          sports: { create: club.sportIds.map((sportId) => ({ sportId })) },
          tags: { create: club.tagIds.map((tagId) => ({ tagId })) },
          amenities: { create: club.amenityIds.map((amenityId) => ({ amenityId })) },
          images: { create: club.imageUrls.map((url, position) => ({ url, position })) },
        },
      });
    }

    for (const trainer of SEED_TRAINERS) {
      await db.prisma.trainer.create({
        data: {
          id: trainer.id,
          createdAt: new Date(trainer.createdAt),
          name: trainer.name,
          slug: trainer.slug,
          slugNormalized: normalizeSlugLookupValue(trainer.slug),
          bio: trainer.bio,
          avatarUrl: trainer.avatarUrl,
          experienceYears: trainer.experienceYears,
          rating: trainer.rating,
          reviewCount: trainer.reviewCount,
          priceFrom: trainer.priceFrom,
          city: trainer.city,
          address: trainer.address,
          latitude: trainer.coordinates?.lat,
          longitude: trainer.coordinates?.lng,
          phone: trainer.phone,
          sportId: trainer.sportId,
          source: trainer.source,
          status: trainer.status,
          sports: { create: trainer.sportIds.map((sportId) => ({ sportId })) },
          specialties: { create: trainer.specialtyIds.map((specialtyId) => ({ specialtyId })) },
          workFormats: { create: trainer.workFormatIds.map((workFormatId) => ({ workFormatId })) },
        },
      });
    }

    for (const offering of SEED_OFFERINGS) {
      await db.prisma.offering.create({
        data: {
          id: offering.id,
          createdAt: new Date(offering.createdAt),
          ownerClubId: offering.ownerType === 'club' ? offering.ownerId : null,
          ownerTrainerId: offering.ownerType === 'trainer' ? offering.ownerId : null,
          sportId: offering.sportId,
          title: offering.title,
          description: offering.description,
          format: offering.format,
          price: offering.price,
          durationMinutes: offering.durationMinutes,
          capacity: offering.capacity,
          address: offering.address,
          latitude: offering.coordinates.lat,
          longitude: offering.coordinates.lng,
        },
      });
    }

    for (const slot of SEED_SCHEDULE) {
      await db.prisma.schedule.create({
        data: {
          id: slot.id,
          createdAt: new Date(slot.createdAt),
          offeringId: slot.offeringId,
          ownerClubId: slot.ownerType === 'club' ? slot.ownerId : null,
          ownerTrainerId: slot.ownerType === 'trainer' ? slot.ownerId : null,
          venueClubId: slot.ownerType === 'trainer' ? (slot.clubId ?? null) : null,
          sportId: slot.sportId,
          title: slot.title,
          date: new Date(`${slot.date}T00:00:00.000Z`),
          startTime: new Date(`1970-01-01T${slot.startTime}:00.000Z`),
          endTime: new Date(`1970-01-01T${slot.endTime}:00.000Z`),
          durationMinutes: slot.durationMinutes,
          level: slot.level,
          capacity: slot.capacity,
          bookedCount: slot.bookedCount,
          price: slot.price,
          room: slot.room,
        },
      });
    }

    for (const table of ['clubs', 'trainers', 'offerings', 'schedule']) {
      await db.prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM "${table}"))`,
      );
    }
  };

  describe('ClubsRepository', () => {
    clubsContract(async () => {
      await seedDatabase();

      return new PrismaClubsRepository(new PrismaTransactionRunner(db.service));
    });
  });

  describe('TrainersRepository', () => {
    trainersContract(async () => {
      await seedDatabase();

      return new PrismaTrainersRepository(new PrismaTransactionRunner(db.service));
    });
  });

  describe('ScheduleRepository', () => {
    scheduleContract(async () => {
      await seedDatabase();

      return new PrismaScheduleRepository(new PrismaTransactionRunner(db.service));
    });
  });

  // Согласованное изменение поведения: у связующих таблиц колонки позиции нет
  // (решение заказчика), поэтому порядок набора ссылок — порядок номеров, а не
  // порядок записи. Проверка стоит здесь, а не в контракте, именно поэтому:
  // контракт обязан быть общим, а это место общим не является.
  describe('порядок наборов ссылок', () => {
    it('набор ссылок возвращается по номерам, а не в порядке записи', async () => {
      await seedDatabase();
      const clubs = new PrismaClubsRepository(new PrismaTransactionRunner(db.service));

      const updated = await clubs.update(1, { sportIds: [8, 2] });

      expect(updated.sportIds).toEqual([2, 8]);
    });
  });
});
