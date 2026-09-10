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
import type {
  ProviderClientNotesRepository,
  ReviewsRepository,
} from '../repositories/crud.repository';
import {
  PROVIDER_CLIENT_NOTES_REPOSITORY,
  REVIEWS_REPOSITORY,
} from '../repositories/crud.repository';
import type {
  ClubsRepository,
  ScheduleRepository,
  TrainersRepository,
} from '../repositories/entities.repository';
import {
  CLUBS_REPOSITORY,
  SCHEDULE_REPOSITORY,
  TRAINERS_REPOSITORY,
} from '../repositories/entities.repository';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';
import type { PublicationSlotInput } from './publication.service';
import { OWNER_ARCHIVE_REASON, PublicationService } from './publication.service';

/**
 * День со сдвигом от сегодняшнего, ключом `YYYY-MM-DD`.
 *
 * ⚠️ Запрет на удаление лица с живыми записями смотрит на СЕГОДНЯШНИЙ день,
 * поэтому «будущее» и «прошлое» в наборе обязаны считаться от часов, а не быть
 * вписаны числом. Дата, вписанная числом, однажды становится прошлым — и проверка
 * запрета молча перестаёт проверять запрет.
 */
const dayKey = (shiftDays: number): string =>
  new Date(Date.now() + shiftDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Пользователь среза: 2 — провайдер-владелец, 1 — атлет, 3 — модератор. */
const user = (id: number, accountKind: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind,
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
  let trainerCards: TrainersRepository;
  let offerings: OfferingsRepository;
  let schedule: ScheduleRepository;
  let bookings: BookingsRepository;
  let reviews: ReviewsRepository;
  let notes: ProviderClientNotesRepository;

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
    trainerCards = harness.app.get(TRAINERS_REPOSITORY);
    offerings = harness.app.get(OFFERINGS_REPOSITORY);
    schedule = harness.app.get(SCHEDULE_REPOSITORY);
    bookings = harness.app.get(BOOKINGS_REPOSITORY);
    reviews = harness.app.get(REVIEWS_REPOSITORY);
    notes = harness.app.get(PROVIDER_CLIENT_NOTES_REPOSITORY);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [user(1, 'person'), user(2, 'person'), user(3, 'admin')],
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

  // --- Правка без расписания (шаг 36.5, решение заказчика 1) -------------------
  //
  // ⚠️ Различие между «нет поля» и «пустой массив» здесь принципиальное и стоит
  // чужих записей. Пустой массив означает «убрать все слоты» — и записи на них
  // отменяются от имени провайдера, портя его же надёжность. Отсутствие поля
  // означает «не трогать вовсе». До этой фазы отличить одно от другого было
  // нечем: схема требовала расписание всегда, и клиент, приславший карточку
  // без него, терял расписание молча и с успешным ответом.

  it('правка без расписания не трогает слоты', async () => {
    const { club, offering, schedules } = await service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
    });

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { phone: '+7 (846) 111-11-11' },
      offering: {},
      slots: undefined,
    });

    const stored = await schedule.findByOfferingId(offering.id);
    expect(stored).toHaveLength(2);
    expect(stored.map((item) => item.id).sort()).toEqual(schedules.map((item) => item.id).sort());
  });

  it('правка без расписания возвращает существующее расписание', async () => {
    // Форма ответа не меняется: клиент рисует карточку по нему же. Отдать пустой
    // список было бы тихой ложью — расписание на месте, а на экране его нет.
    const { club, schedules } = await service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
    });

    const result = await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { phone: '+7 (846) 111-11-11' },
      offering: {},
      slots: undefined,
    });

    expect(result.schedules.map((item) => item.id).sort()).toEqual(
      schedules.map((item) => item.id).sort(),
    );
  });

  it('правка без расписания не отменяет записи людей', async () => {
    const { club, schedules } = await createClub();
    await bookings.insert({
      scheduleId: schedules[0].id,
      ownerType: 'club',
      ownerId: club.id,
      clubId: club.id,
      userId: 1,
      sportId: 1,
      date: dayKey(3),
      status: 'confirmed',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
    } as never);

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { phone: '+7 (846) 111-11-11' },
      offering: {},
      slots: undefined,
    });

    const stored = await bookings.findAll();
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('confirmed');
    expect(stored[0].scheduleId).toBe(schedules[0].id);
  });

  it('пустой массив слотов по-прежнему означает «убрать все»', async () => {
    // Сторож границы: послабление коснулось ОТСУТСТВИЯ поля, а не пустого списка.
    // Если однажды одно начнёт подменять другое, этот тест покраснеет.
    const { club, offering } = await createClub();

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: {},
      offering: {},
      slots: [],
    });

    expect(await schedule.findByOfferingId(offering.id)).toHaveLength(0);
  });

  it('правка карточки тренера без расписания не трогает слоты', async () => {
    const { trainer, offering, schedules } = await service.createTrainer({
      trainer: {
        name: 'Пётр',
        slug: 'petr-edit-without-slots',
        bio: 'Био',
        experienceYears: 5,
        managedByUserId: 2,
      } as unknown as Omit<Trainer, 'id' | 'createdAt'>,
      offering: { ...offeringInput, ownerType: 'trainer' as const },
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
      clubId: null,
      userId: 2,
    });

    await service.updateTrainer({
      trainerId: trainer.id,
      userId: 2,
      trainer: { phone: '+7 (846) 222-22-22' },
      offering: {},
      slots: undefined,
    });

    const stored = await schedule.findByOfferingId(offering.id);
    expect(stored).toHaveLength(2);
    expect(stored.map((item) => item.id).sort()).toEqual(schedules.map((item) => item.id).sort());
  });

  // --- Удаление слота с живыми записями (шаг 36.8, решение заказчика 2) --------
  //
  // ⚠️ Смысл запрета — тот же, что у запрета убирать лицо: дело не в целостности
  // данных, а в людях. Раньше слот, которого нет в теле, удалялся, а записи на него
  // отменялись «от имени провайдера» — то есть человек получал отмену, которую
  // никто не заказывал, а надёжность провайдера падала за его же правку формы.

  it('удаление слота с будущей записью отклоняется с числом записей', async () => {
    const { club, offering, schedules } = await service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
    });

    await bookings.insert({
      scheduleId: schedules[1].id,
      ownerType: 'club',
      ownerId: club.id,
      clubId: club.id,
      userId: 1,
      sportId: 1,
      date: dayKey(3),
      status: 'confirmed',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
    } as never);

    await expect(
      service.updateClub({
        clubId: club.id,
        userId: 2,
        club: {},
        offering: {},
        // Второго слота в теле нет — прежде это означало бы его удаление.
        slots: [{ ...slot({ title: 'Первый' }), id: schedules[0].id }],
      }),
    ).rejects.toThrow(/записаны люди \(1\)/);

    // Отказ обязан быть отказом: слот на месте, запись цела.
    expect(await schedule.findByOfferingId(offering.id)).toHaveLength(2);
    const stored = await bookings.findAll();
    expect(stored[0].status).toBe('confirmed');
  });

  it('прошедшая запись удалению слота не мешает', async () => {
    // Занятие состоялось — держать из-за него слот незачем. Запись остаётся
    // в истории человека, ссылка на слот снимается.
    const { club, offering, schedules } = await service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
    });

    await bookings.insert({
      scheduleId: schedules[1].id,
      ownerType: 'club',
      ownerId: club.id,
      clubId: club.id,
      userId: 1,
      sportId: 1,
      date: dayKey(-3),
      status: 'completed',
      paymentStatus: 'paid',
      totalPrice: 1000,
    } as never);

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: {},
      offering: {},
      slots: [{ ...slot({ title: 'Первый' }), id: schedules[0].id }],
    });

    expect(await schedule.findByOfferingId(offering.id)).toHaveLength(1);
  });

  it('отменённая запись удалению слота не мешает', async () => {
    const { club, offering, schedules } = await service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
    });

    await bookings.insert({
      scheduleId: schedules[1].id,
      ownerType: 'club',
      ownerId: club.id,
      clubId: club.id,
      userId: 1,
      sportId: 1,
      date: dayKey(3),
      status: 'cancelled_by_user',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
    } as never);

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: {},
      offering: {},
      slots: [{ ...slot({ title: 'Первый' }), id: schedules[0].id }],
    });

    expect(await schedule.findByOfferingId(offering.id)).toHaveLength(1);
  });

  it('слот без записей удаляется по-прежнему', async () => {
    // Контрольная группа: без неё запрет был бы зелен и в случае, когда правка
    // расписания сломана целиком.
    const { club, offering, schedules } = await service.createClub({
      club: clubInput,
      offering: offeringInput,
      slots: [slot({ title: 'Первый' }), slot({ title: 'Второй' })],
    });

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: {},
      offering: {},
      slots: [{ ...slot({ title: 'Первый' }), id: schedules[0].id }],
    });

    expect(await schedule.findByOfferingId(offering.id)).toHaveLength(1);
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

  // --- Правка скрытой публикации (шаг 36.20, решение заказчика 15) -------------
  //
  // ⚠️ Смена продуктового поведения. Прежде ЛЮБАЯ правка снимала скрытие: владелец
  // нажимал «Сохранить» — и публикация возвращалась в каталог. То есть модерация
  // обходилась одним нажатием, и решение модератора не стоило ничего.
  //
  // Теперь развилка проходит по ВИДУ скрытия, а не по факту:
  //   скрыл модератор → остаётся скрытой, уходит на повторную проверку;
  //   убрал сам владелец → правка возвращает в каталог, как и раньше.
  //
  // Второе — не послабление, а сохранение существующего пути: другой кнопки
  // «вернуть из архива» у владельца нет, и без этой ветки архив стал бы билетом
  // в один конец, чего никто не просил.

  it('правка публикации, скрытой МОДЕРАТОРОМ, не снимает скрытие', async () => {
    const { club } = await createClub();
    await clubs.update(club.id, {
      status: 'hidden',
      hideReason: 'жалоба',
      hiddenByUserId: 3,
      hiddenAt: '2026-04-01T00:00:00.000Z',
      hiddenKind: 'moderation',
    });

    const result = await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { name: 'Исправлено' },
      offering: {},
      slots: [],
    });

    expect(result.club.status).toBe('hidden');
    expect(result.club.hideReason).toBe('жалоба');
    expect(result.club.awaitingRecheck).toBe(true);
  });

  it('правка скрытой модератором уведомляет ТОГО, КТО СКРЫЛ', async () => {
    // ⚠️ Адресат — конкретный человек, разбиравшийся с публикацией, а не «все
    // администраторы». Механизм существующий: колокольчик показывается любому
    // вошедшему, просто до этой фазы админу никто не писал.
    const { club } = await createClub();
    await clubs.update(club.id, {
      status: 'hidden',
      hideReason: 'жалоба',
      hiddenByUserId: 3,
      hiddenAt: '2026-04-01T00:00:00.000Z',
      hiddenKind: 'moderation',
    });

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { name: 'Исправлено' },
      offering: {},
      slots: [],
    });

    const stored = await harness.read<{ userId: number; type: string }[]>('notifications');
    const recheck = stored.filter((item) => item.type === 'publication_recheck_requested');

    expect(recheck).toHaveLength(1);
    expect(recheck[0].userId).toBe(3);
  });

  it('правка архива владельца модератора не беспокоит', async () => {
    // Обратная сторона: письмо о том, что человек вернул из архива СВОЮ публикацию,
    // надзору не нужно и только приучает не читать уведомления.
    const { club } = await createClub();
    await clubs.update(club.id, {
      status: 'hidden',
      hideReason: OWNER_ARCHIVE_REASON,
      hiddenByUserId: 2,
      hiddenAt: '2026-04-01T00:00:00.000Z',
      hiddenKind: 'owner_archive',
    });

    await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { name: 'Исправлено' },
      offering: {},
      slots: [],
    });

    const stored = await harness.read<{ type: string }[]>('notifications');
    expect(stored.filter((item) => item.type === 'publication_recheck_requested')).toHaveLength(0);
  });

  it('правка публикации, убранной ВЛАДЕЛЬЦЕМ в архив, возвращает её в каталог', async () => {
    const { club } = await createClub();
    await clubs.update(club.id, {
      status: 'hidden',
      hideReason: OWNER_ARCHIVE_REASON,
      hiddenByUserId: 2,
      hiddenAt: '2026-04-01T00:00:00.000Z',
      hiddenKind: 'owner_archive',
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
    expect(result.club.hiddenKind).toBeUndefined();
    expect(result.club.awaitingRecheck).toBe(false);
  });

  it('скрытая без вида считается скрытой МОДЕРАТОРОМ — отказ закрывается, а не открывается', async () => {
    // Осторожная сторона развилки. После миграции строк без вида не остаётся,
    // но если такая появится, ошибиться надо в сторону сохранения скрытия:
    // «вернули в каталог то, что прятал модератор» — дефект, а «не вернули
    // из архива» — неудобство, которое видно и лечится вторым нажатием.
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

    expect(result.club.status).toBe('hidden');
  });

  it('правка НЕскрытой публикации признака повторной проверки не ставит', async () => {
    const { club } = await createClub();

    const result = await service.updateClub({
      clubId: club.id,
      userId: 2,
      club: { name: 'Просто правка' },
      offering: {},
      slots: [],
    });

    expect(result.club.status).toBe('published');
    expect(result.club.awaitingRecheck).toBe(false);
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

  it('модератор стирает лицо целиком: услуги, слоты, записи и отзывы', async () => {
    const { club, schedules } = await createClub();
    await bookings.insert({
      scheduleId: schedules[0].id,
      userId: 1,
      ownerType: 'club',
      ownerId: club.id,
      clubId: club.id,
      sportId: 1,
      // ⚠️ Занятие в ПРОШЛОМ и намеренно: живые будущие записи запрещают
      // стирание точно так же, как запрещают архивирование, и проверка
      // каскада должна проверять каскад, а не запрет.
      date: dayKey(-30),
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
    await notes.insert({
      providerUserId: 2,
      clientUserId: 1,
      note: 'Заметка при лице',
      faceType: 'club',
      faceId: club.id,
    });

    // ⚠️ Шаг 35.25: от чьего лица идёт удаление, теперь говорится вслух.
    // Раньше здесь стоял вызов с одним аргументом, и проверка владения молча
    // не выполнялась — забыть её было так же легко, как забыть аргумент.
    //
    // ⚠️ Шаг 35.24a: стирание осталось ТОЛЬКО у модератора, и метод отвечает,
    // что именно произошло с публикацией.
    expect(await service.removeClub(club.id, { kind: 'moderator' })).toBe('deleted');

    expect(await clubs.findById(club.id)).toBeNull();
    expect(await offerings.findAll()).toHaveLength(0);
    expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(0);
    expect(await bookings.findAll()).toHaveLength(0);
    expect(await reviews.findAll()).toHaveLength(0);
    // ⚠️ Заметки о клиентах уходят вместе с лицом — каскадом внешнего ключа
    // (шаг 35.27a). До переезда на лицо они были привязаны к ЧЕЛОВЕКУ и после
    // удаления публикации оставались без предмета: это вторая половина ловушки
    // 7.10, и починил её сам перенос, а не отдельная чистка в каскаде.
    expect(await notes.findAll()).toHaveLength(0);
  });

  it('удаление несуществующего клуба сообщает id', async () => {
    await expect(service.removeClub(555, { kind: 'moderator' })).rejects.toThrow(
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

  // --- Шаг 35.24a: убрать лицо = архив, а не стирание ------------------------
  //
  // Ловушка 7.10 фазы: удаление публикации сносило каскадом ЧУЖУЮ историю —
  // записи людей на занятия, их отзывы, связи с чужими тренерами. Пока завести
  // лицо мог только «провайдер», это было редкостью; после фазы 35 лицо заводит
  // любой вошедший, и «завёл — передумал — убрал» становится обычным действием.
  //
  // Решение заказчика 21: запрет плюс архивирование. Здесь проверяются оба
  // и вместе с ними — что чужая история переживает уборку целиком.
  describe('Убрать лицо: запрет при живых записях и архив вместо стирания', () => {
    /** Живая запись на будущее занятие — то, ради чего стоит запрет. */
    const insertUpcoming = (club: { id: number }, scheduleId: number) =>
      bookings.insert({
        scheduleId,
        userId: 1,
        ownerType: 'club',
        ownerId: club.id,
        clubId: club.id,
        sportId: 1,
        date: dayKey(3),
        status: 'confirmed',
        paymentStatus: 'unpaid',
        totalPrice: 1000,
        statusHistory: [],
      } as never);

    it('владелец убирает клуб: лицо прячется, а история остаётся целой', async () => {
      const { club, offering, schedules } = await createClub();
      await bookings.insert({
        scheduleId: schedules[0].id,
        userId: 1,
        ownerType: 'club',
        ownerId: club.id,
        clubId: club.id,
        sportId: 1,
        date: dayKey(-30),
        status: 'completed',
        paymentStatus: 'paid',
        totalPrice: 1000,
        statusHistory: [],
      } as never);
      await reviews.insert({ userId: 1, clubId: club.id, rating: 5, text: 'Отлично' });

      expect(await service.removeClub(club.id, { kind: 'owner', userId: 2 })).toBe('archived');

      // Лицо на месте и помечено скрытым — тем же механизмом, которым пользуется
      // модерация. Второго механизма заводить не понадобилось.
      const stored = await clubs.findById(club.id);
      expect(stored).not.toBeNull();
      expect(stored?.status).toBe('hidden');
      expect(stored?.hiddenByUserId).toBe(2);
      expect(stored?.hiddenAt).toBeDefined();
      expect(stored?.hideReason).toBeTruthy();

      // Чужая история цела целиком: прошедшая запись, отзыв, услуга и слоты.
      // Отзыв — чужие слова, и уборка лица их не стирает.
      expect(await bookings.findAll()).toHaveLength(1);
      expect(await reviews.findAll()).toHaveLength(1);
      expect(await offerings.findById(offering.id)).not.toBeNull();
      expect(await schedule.findByOfferingId(offering.id)).toHaveLength(1);
    });

    it('клуб с живой записью на будущее убрать нельзя, и в базе ничего не меняется', async () => {
      const { club, schedules } = await createClub();
      await insertUpcoming(club, schedules[0].id);

      // Отказ обязан ОБЪЯСНЯТЬ причину: «нельзя» без причины не подсказывает,
      // что делать дальше, и владелец решит, что сломалось приложение.
      await expect(service.removeClub(club.id, { kind: 'owner', userId: 2 })).rejects.toThrow(
        /отмен/i,
      );

      // Вторая половина проверки и главная: состояние базы не тронуто.
      const stored = await clubs.findById(club.id);
      expect(stored?.status).not.toBe('hidden');
      expect(stored?.hiddenAt).toBeUndefined();
      expect(await bookings.findAll()).toHaveLength(1);
    });

    it('модератор тоже не стирает лицо с живой записью на будущее', async () => {
      // Каскад модератора сносит те же чужие записи, что и каскад владельца.
      // Право модерации даёт трогать ЧУЖУЮ вещь, а не сносить занятие,
      // на которое люди записаны и ничего об этом не узнают.
      const { club, schedules } = await createClub();
      await insertUpcoming(club, schedules[0].id);

      await expect(service.removeClub(club.id, { kind: 'moderator' })).rejects.toThrow(/отмен/i);

      expect(await clubs.findById(club.id)).not.toBeNull();
      expect(await bookings.findAll()).toHaveLength(1);
    });

    it('отменённая запись запрет снимает', async () => {
      // Контрольная группа к двум отказам выше: без неё зелёный запрет
      // был бы одинаково зелен и в случае, когда уборка сломана для всех.
      const { club, schedules } = await createClub();
      const booking = await insertUpcoming(club, schedules[0].id);
      await bookings.update(booking.id, { status: 'cancelled_by_provider' });

      expect(await service.removeClub(club.id, { kind: 'owner', userId: 2 })).toBe('archived');
      expect((await clubs.findById(club.id))?.status).toBe('hidden');
    });

    it('чужое лицо владельцем не убирается', async () => {
      const { club } = await createClub();

      await expect(service.removeClub(club.id, { kind: 'owner', userId: 1 })).rejects.toThrow(
        `Недостаточно прав для редактирования клуба с id ${club.id}`,
      );
      expect((await clubs.findById(club.id))?.status).not.toBe('hidden');
    });

    it('карточка тренера убирается тем же правилом', async () => {
      const created = await service.createTrainer({
        trainer: {
          name: 'Пётр',
          slug: 'petr-archive',
          bio: 'Био',
          experienceYears: 5,
          managedByUserId: 2,
        } as unknown as Omit<Trainer, 'id' | 'createdAt'>,
        offering: { ...offeringInput, ownerType: 'trainer' as const },
        slots: [slot()],
        userId: 2,
      });

      expect(await service.removeTrainer(created.trainer.id, { kind: 'owner', userId: 2 })).toBe(
        'archived',
      );

      const stored = await trainerCards.findById(created.trainer.id);
      expect(stored?.status).toBe('hidden');
      expect(stored?.hiddenByUserId).toBe(2);
    });
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
