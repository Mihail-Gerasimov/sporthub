// Тесты сервиса публикаций — самых тяжёлых операций проекта.
// Проверяем создание с согласованными ссылками, согласование расписания
// (создать/обновить/удалить за один запрос), перенос дат записей, снятие
// скрытия при правке и каскадное удаление.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Club, Offering, Trainer } from '@sporthub/types';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type { OfferingsRepository } from '../repositories/catalog.repository';
import { OFFERINGS_REPOSITORY } from '../repositories/catalog.repository';
import type { ReviewsRepository } from '../repositories/crud.repository';
import { REVIEWS_REPOSITORY } from '../repositories/crud.repository';
import type { ClubsRepository, ScheduleRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, SCHEDULE_REPOSITORY } from '../repositories/entities.repository';
import { StorageModule } from '../storage/storage.module';
import type { PublicationSlotInput } from './publication.service';
import { PublicationService } from './publication.service';

describe('PublicationService', () => {
  let dataDirectory: string;
  let service: PublicationService;
  let clubs: ClubsRepository;
  let offerings: OfferingsRepository;
  let schedule: ScheduleRepository;
  let bookings: BookingsRepository;
  let reviews: ReviewsRepository;

  const clubInput = {
    name: 'Кроссфит',
    slug: 'krossfit',
    description: 'Описание',
    shortDescription: 'Кратко',
    city: 'Самара',
    address: 'ул. Ленина, 1',
    phone: '+7 (846) 000-00-00',
    coordinates: { lat: 53.2, lng: 50.1 },
    sportIds: [1],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 1000,
    distanceKm: 0,
    managedByUserId: 2,
  } as unknown as Omit<Club, 'id' | 'createdAt'>;

  const offeringInput = {
    ownerType: 'club',
    sportId: 1,
    title: 'Тренировка',
    description: 'Описание',
    format: 'group',
    price: 1000,
    durationMinutes: 60,
    capacity: 10,
    address: 'ул. Ленина, 1',
    coordinates: { lat: 53.2, lng: 50.1 },
  } as unknown as Omit<Offering, 'id' | 'createdAt' | 'ownerId'>;

  const slot = (overrides: Record<string, unknown> = {}): PublicationSlotInput =>
    ({
      sportId: 1,
      title: 'Утро',
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '09:00',
      durationMinutes: 60,
      level: 'any',
      capacity: 10,
      bookedCount: 0,
      price: 1000,
      ...overrides,
    }) as unknown as PublicationSlotInput;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-pub-'));
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    for (const file of [
      'clubs', 'trainers', 'offerings', 'schedule', 'bookings', 'reviews',
      'notifications', 'logs', 'users', 'trainer-club-links', 'provider-client-notes',
      'sports', 'cities', 'tags', 'amenities', 'specialties', 'work-formats',
    ]) {
      await writeFile(path.join(dataDirectory, `${file}.json`), '[]\n', 'utf8');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
      providers: [PublicationService],
    }).compile();

    service = moduleRef.get(PublicationService);
    clubs = moduleRef.get(CLUBS_REPOSITORY);
    offerings = moduleRef.get(OFFERINGS_REPOSITORY);
    schedule = moduleRef.get(SCHEDULE_REPOSITORY);
    bookings = moduleRef.get(BOOKINGS_REPOSITORY);
    reviews = moduleRef.get(REVIEWS_REPOSITORY);
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await rm(dataDirectory, { force: true, recursive: true });
  });

  const createClub = () =>
    service.createClub({ club: clubInput, offering: offeringInput, slots: [slot()] });

  it('создаёт клуб, услугу и слоты со связанными ссылками', async () => {
    const result = await createClub();

    expect(result.club.id).toBe(1);
    expect(result.offering.ownerId).toBe(result.club.id);
    expect(result.offering.ownerType).toBe('club');
    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0].offeringId).toBe(result.offering.id);
    expect(result.schedules[0].clubId).toBe(result.club.id);
  });

  it('правка чужой публикации запрещена с дословным текстом', async () => {
    const { club } = await createClub();

    await expect(
      service.updateClub({ clubId: club.id, userId: 999, club: {}, offering: {}, slots: [] }),
    ).rejects.toThrow(`Недостаточно прав для редактирования клуба с id ${club.id}`);
  });

  it('правка несуществующего клуба сообщает id', async () => {
    await expect(
      service.updateClub({ clubId: 777, userId: 2, club: {}, offering: {}, slots: [] }),
    ).rejects.toThrow('Клуб с id 777 не найден');
  });

  it('повторяющиеся id слотов отклоняются', async () => {
    const { club, schedules } = await createClub();
    const duplicate = { ...slot(), id: schedules[0].id };

    await expect(
      service.updateClub({
        clubId: club.id,
        userId: 2,
        club: {},
        offering: {},
        slots: [duplicate, duplicate],
      }),
    ).rejects.toThrow('В payload редактирования клуба есть повторяющиеся id слотов');
  });

  it('согласование расписания: один сохраняется, один удаляется, один добавляется', async () => {
    const { club, offering, schedules } = await service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
    });

    const kept = schedules[0];
    const result = await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: {},
      offering: {},
      slots: [
        { ...slot({ title: 'Первый изменённый' }), id: kept.id },
        slot({ title: 'Третий' }),
      ],
    });

    expect(result.schedules).toHaveLength(2);
    const stored = await schedule.findByOfferingId(offering.id);
    expect(stored).toHaveLength(2);
    expect(stored.map((item) => item.title).sort()).toEqual(['Первый изменённый', 'Третий']);
  });

  it('перенос даты слота тянет за собой даты записей', async () => {
    const { club, schedules } = await createClub();
    await bookings.insert({
      scheduleId: schedules[0].id,
      userId: 1,
      sportId: 1,
      date: '2026-04-01',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
    } as never);

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: {},
      offering: {},
      slots: [{ ...slot({ date: '2026-05-01' }), id: schedules[0].id }],
    });

    expect((await bookings.findAll())[0].date).toBe('2026-05-01');
  });

  it('правка скрытой публикации снимает скрытие', async () => {
    const { club } = await createClub();
    await clubs.update(club.id, {
      status: 'hidden',
      hideReason: 'жалоба',
      hiddenByUserId: 3,
      hiddenAt: '2026-04-01T00:00:00.000Z',
    });

    const result = await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { name: 'Исправлено' },
      offering: {},
      slots: [],
    });

    expect(result.club.status).toBe('published');
    expect(result.club.hideReason).toBeUndefined();
  });

  it('слот с неизвестным id отклоняется', async () => {
    const { club } = await createClub();

    await expect(
      service.updateClub({
        clubId: club.id,
        userId: 2,
        club: {},
        offering: {},
        slots: [{ ...slot(), id: 9999 }],
      }),
    ).rejects.toThrow('Слот клуба с id 9999 не найден');
  });

  it('удаление забирает услуги, слоты, записи и отзывы', async () => {
    const { club, schedules } = await createClub();
    await bookings.insert({
      scheduleId: schedules[0].id,
      userId: 1,
      clubId: club.id,
      sportId: 1,
      date: '2026-04-01',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
    } as never);
    await reviews.insert({ userId: 1, clubId: club.id, rating: 5, text: 'Отлично' });

    await service.deleteClub(club.id);

    expect(await clubs.findById(club.id)).toBeNull();
    expect(await offerings.findAll()).toHaveLength(0);
    expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(0);
    expect(await bookings.findAll()).toHaveLength(0);
    expect(await reviews.findAll()).toHaveLength(0);
  });

  it('удаление несуществующего клуба сообщает id', async () => {
    await expect(service.deleteClub(555)).rejects.toThrow('Клуб с id 555 не найден');
  });

  it('публикация тренера с клубом создаёт подтверждённую связь', async () => {
    const club = await clubs.insert(clubInput);

    const result = await service.createTrainer({
      trainer: { name: 'Пётр', slug: 'petr', bio: 'Био', experienceYears: 5 } as unknown as Omit<Trainer, 'id' | 'createdAt'>,
      offering: { ...offeringInput, ownerType: 'trainer' as const },
      slots: [slot()],
      clubId: club.id,
      userId: 2,
    });

    expect(result.offering.trainerClubLinkId).toBeDefined();
    expect(result.schedules[0].trainerId).toBe(result.trainer.id);
  });
});
