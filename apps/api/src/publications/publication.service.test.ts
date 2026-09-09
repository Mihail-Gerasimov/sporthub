// Тесты сервиса публикаций — самых тяжёлых операций проекта.
// Проверяем создание с согласованными ссылками, согласование расписания
// (создать/обновить/удалить за один запрос), перенос дат записей, снятие
// скрытия при правке и каскадное удаление.
//
// Поднимается всё приложение, а не один сервис с хранилищем: отмена записей
// на удаляемый слот делается сервисом записей, а тот тянет журнал, уведомления
// и контекст слота. Список провайдеров вручную пришлось бы дописывать
// при каждой новой зависимости — и он бы протух молча.
//
// ⚠️ Перед каждым тестом переносится целый срез, а не отдельные коллекции:
// у базы есть внешние ключи и счётчики номеров. Справочники нужны потому, что
// публикация ссылается на вид спорта; пользователи — потому, что на них
// ссылаются владелец клуба, автор записи, автор отзыва и тот, кто скрыл
// публикацию. Пустые коллекции в срезе обязательны: они возвращают счётчики
// номеров к единице, а на номер 1 у первого клуба опирается первая же проверка.

import type { Club, Offering, Trainer } from '@sporthub/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type { OfferingsRepository } from '../repositories/catalog.repository';
import { OFFERINGS_REPOSITORY } from '../repositories/catalog.repository';
import type { ReviewsRepository } from '../repositories/crud.repository';
import { REVIEWS_REPOSITORY } from '../repositories/crud.repository';
import type { ClubsRepository, ScheduleRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, SCHEDULE_REPOSITORY } from '../repositories/entities.repository';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';
import type { PublicationSlotInput } from './publication.service';
import { PublicationService } from './publication.service';

/** Пользователь среза: 2 — провайдер-владелец, 1 — атлет, 3 — модератор. */
const user = (id: number, role: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@publication-service.test`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('PublicationService', () => {
  let harness: TestHarness;
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

  beforeAll(async () => {
    harness = await createTestHarness('publication-service');

    service = harness.app.get(PublicationService);
    clubs = harness.app.get(CLUBS_REPOSITORY);
    offerings = harness.app.get(OFFERINGS_REPOSITORY);
    schedule = harness.app.get(SCHEDULE_REPOSITORY);
    bookings = harness.app.get(BOOKINGS_REPOSITORY);
    reviews = harness.app.get(REVIEWS_REPOSITORY);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [user(1, 'athlete'), user(2, 'club_owner'), user(3, 'admin')],
      clubs: [],
      trainers: [],
      offerings: [],
      schedule: [],
      bookings: [],
      reviews: [],
      notifications: [],
      logs: [],
      'trainer-club-links': [],
      'provider-client-notes': [],
    });
  });

  const createClub = () =>
    service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot()],
    });

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
      service.updateClub({
        clubId: club.id,
        userId: 999,
        club: {},
        offering: {},
        slots: [],
      }),
    ).rejects.toThrow(`Недостаточно прав для редактирования клуба с id ${club.id}`);
  });

  it('правка несуществующего клуба сообщает id', async () => {
    await expect(
      service.updateClub({
        clubId: 777,
        userId: 2,
        club: {},
        offering: {},
        slots: [],
      }),
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
      slots: [{ ...slot({ title: 'Первый изменённый' }), id: kept.id }, slot({ title: 'Третий' })],
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
      // Владелец записи у базы обязателен: без него неизвестно, чьё это занятие.
      // Клуб здесь и есть владелец — тот самый, что был у слота.
      ownerType: 'club',
      ownerId: club.id,
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
      ownerType: 'club',
      ownerId: club.id,
      clubId: club.id,
      sportId: 1,
      date: '2026-04-01',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
    } as never);
    await reviews.insert({
      userId: 1,
      clubId: club.id,
      rating: 5,
      text: 'Отлично',
    });

    // ⚠️ Шаг 35.25: от чьего лица идёт удаление, теперь говорится вслух.
    // Раньше здесь стоял вызов с одним аргументом, и проверка владения молча
    // не выполнялась — забыть её было так же легко, как забыть аргумент.
    await service.deleteClub(club.id, { kind: 'moderator' });

    expect(await clubs.findById(club.id)).toBeNull();
    expect(await offerings.findAll()).toHaveLength(0);
    expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(0);
    expect(await bookings.findAll()).toHaveLength(0);
    expect(await reviews.findAll()).toHaveLength(0);
  });

  it('удаление несуществующего клуба сообщает id', async () => {
    await expect(service.deleteClub(555, { kind: 'moderator' })).rejects.toThrow(
      'Клуб с id 555 не найден',
    );
  });

  it('публикация тренера с клубом создаёт подтверждённую связь', async () => {
    const club = await clubs.insert(clubInput);

    const result = await service.createTrainer({
      trainer: {
        name: 'Пётр',
        slug: 'petr',
        bio: 'Био',
        experienceYears: 5,
      } as unknown as Omit<Trainer, 'id' | 'createdAt'>,
      offering: { ...offeringInput, ownerType: 'trainer' as const },
      slots: [slot()],
      clubId: club.id,
      userId: 2,
    });

    expect(result.offering.trainerClubLinkId).toBeDefined();
    expect(result.schedules[0].trainerId).toBe(result.trainer.id);
  });

  describe('Удаление слота с записями', () => {
    it('переводит записи в «отменено провайдером», а не бросает их на несуществующий слот', async () => {
      const created = await createClub();
      const slotId = created.schedules[0].id;

      await bookings.insert({
        scheduleId: slotId,
        offeringId: created.offering.id,
        ownerType: 'club',
        ownerId: created.club.id,
        clubId: created.club.id,
        userId: 1,
        sportId: 1,
        date: created.schedules[0].date,
        status: 'confirmed',
        paymentStatus: 'unpaid',
        totalPrice: 1000,
        statusHistory: [],
      } as never);

      // Правка расписания без этого слота = его удаление.
      await service.updateClub({
        clubId: created.club.id,
        userId: 2,
        club: {},
        offering: {},
        slots: [],
      });

      const all = await bookings.findAll();

      expect(all).toHaveLength(1);
      // История атлета цела: запись осталась, но отменена.
      expect(all[0].status).toBe('cancelled_by_provider');
      // Слот действительно убран: провайдер просил именно этого, и «успех, но слот
      // остался» был бы молчаливым полууспехом.
      expect(await schedule.findByOfferingId(created.offering.id)).toHaveLength(0);
      // Ссылка на слот обнулена: занятия в расписании больше нет, а запись есть.
      // Дата, цена и вид спорта лежат в самой записи снимком — показывать её есть чем.
      //
      // ⚠️ НА БАЗЕ ЭТА ПРОВЕРКА КРАСНАЯ, И ЭТО НАХОДКА, А НЕ ПОМЕХА. `toBooking`
      // в `repositories/prisma/bookings.repository.ts` прогоняет `scheduleId` через
      // `omitNulls`, поэтому пустая ссылка не превращается в `null`, а исчезает
      // ключом вовсе. Тип объявляет `scheduleId: EntityId | null` обязательным полем,
      // и на это опирается код: `booking.service.ts` сравнивает `=== null` в четырёх
      // местах. При `undefined` сравнение не срабатывает, и отмена атлетом записи
      // с убранным слотом уходит в `schedule.findById(undefined)` — Prisma отвечает
      // «Invalid findUnique() invocation», то есть пятисоткой. Проверка стоит
      // последней, чтобы остальные три успели отработать; ожидание не подгоняется
      // под фактический результат — чинить надо реализацию, а не проверку.
      expect(all[0].scheduleId).toBeNull();
    });

    it('освобождает места удаляемого слота', async () => {
      const created = await createClub();
      const slotId = created.schedules[0].id;

      await bookings.insert({
        scheduleId: slotId,
        offeringId: created.offering.id,
        ownerType: 'club',
        ownerId: created.club.id,
        clubId: created.club.id,
        userId: 1,
        sportId: 1,
        date: created.schedules[0].date,
        status: 'confirmed',
        paymentStatus: 'unpaid',
        totalPrice: 1000,
        statusHistory: [],
      } as never);
      await schedule.changeBookedCount(slotId, 1);

      await service.updateClub({
        clubId: created.club.id,
        userId: 2,
        club: {},
        offering: {},
        slots: [],
      });

      const all = await bookings.findAll();

      expect(all[0].status).toBe('cancelled_by_provider');
    });
  });
});
