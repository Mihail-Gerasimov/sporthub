// Тесты reverse-mapping: persisted-сущности → form-state для edit-форм (Step 15.2)
// Проверяют: mapClubToFormState, mapTrainerToFormState, roundtrip schedule slots
import { describe, expect, it } from 'vitest';

import type { Club, Offering, Schedule, Trainer } from '@sporthub/types';

import { mapClubToFormState, mapTrainerToFormState } from '@/lib/contracts/reverse-mapping';

/* ========================================
   Фикстуры — persisted-сущности
   ======================================== */

/** Клуб-фикстура */
function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: 100,
    createdAt: '2026-03-01T10:00:00.000Z',
    name: 'FitZone Studio',
    slug: 'fitzone-studio',
    description: 'Описание клуба длиной более пятидесяти символов для прохождения валидации формы.',
    shortDescription: 'Описание клуба.',
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    phone: '+7 (999) 123-45-67',
    email: 'info@fitzone.ru',
    coordinates: { lat: 55.75, lng: 37.62 },
    sportIds: [1, 4], // Йога (1), Кроссфит (4)
    imageUrls: ['/images/club1.jpg'],
    amenityIds: [1, 2],
    tagIds: [1],
    rating: 4.5,
    reviewCount: 12,
    priceFrom: 1200,
    distanceKm: 2.5,
    managedByUserId: 2,
    source: 'provider',
    status: 'published',
    ...overrides,
  };
}

/** Offering клуба */
function makeClubOffering(overrides: Partial<Offering> = {}): Offering {
  return {
    id: 200,
    createdAt: '2026-03-01T10:00:00.000Z',
    ownerType: 'club',
    ownerId: 100,
    affiliatedClubId: 100,
    sportId: 1,
    title: 'Занятия — FitZone Studio',
    description: 'Описание клуба длиной более пятидесяти символов для прохождения валидации формы.',
    format: 'group',
    price: 1200,
    durationMinutes: 60,
    capacity: 20,
    address: 'ул. Спортивная, 10',
    coordinates: { lat: 55.75, lng: 37.62 },
    ...overrides,
  };
}

/** Слоты расписания клуба */
function makeClubSchedules(): Schedule[] {
  return [
    {
      id: 301,
      createdAt: '2026-03-01T10:00:00.000Z',
      offeringId: 200,
      ownerType: 'club',
      ownerId: 100,
      clubId: 100,
      sportId: 1,
      title: 'Утренняя йога',
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '09:00',
      durationMinutes: 60,
      level: 'all_levels',
      capacity: 15,
      bookedCount: 3,
      price: 900,
      room: 'Зал №1',
    },
    {
      id: 302,
      createdAt: '2026-03-01T10:00:00.000Z',
      offeringId: 200,
      ownerType: 'club',
      ownerId: 100,
      clubId: 100,
      sportId: 4,
      title: 'Кроссфит',
      date: '2026-04-02',
      startTime: '18:00',
      endTime: '19:30',
      durationMinutes: 90,
      level: 'all_levels',
      capacity: 12,
      bookedCount: 5,
      price: 1500,
      room: 'Зал №2',
    },
  ];
}

/** Тренер-фикстура */
function makeTrainer(overrides: Partial<Trainer> = {}): Trainer {
  return {
    id: 400,
    createdAt: '2026-03-01T10:00:00.000Z',
    name: 'Александр Иванов',
    slug: 'александр-иванов',
    bio: 'Описание тренера длиной более пятидесяти символов для прохождения валидации формы публикации.',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [1, 2],
    workFormatIds: [1],
    rating: 4.8,
    reviewCount: 20,
    priceFrom: 2000,
    sportIds: [2], // Бокс (2)
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    coordinates: { lat: 55.75, lng: 37.62 },
    affiliatedClubId: 100,
    managedByUserId: 2,
    source: 'provider',
    status: 'published',
    ...overrides,
  };
}

/** Offering тренера */
function makeTrainerOffering(overrides: Partial<Offering> = {}): Offering {
  return {
    id: 500,
    createdAt: '2026-03-01T10:00:00.000Z',
    ownerType: 'trainer',
    ownerId: 400,
    affiliatedClubId: 100,
    sportId: 2,
    title: 'Персональная тренировка',
    description: 'Индивидуальная тренировка по боксу',
    format: 'personal',
    price: 2000,
    durationMinutes: 60,
    capacity: 1,
    address: 'Зал №3',
    coordinates: { lat: 55.75, lng: 37.62 },
    ...overrides,
  };
}

/** Слоты расписания тренера */
function makeTrainerSchedules(): Schedule[] {
  return [
    {
      id: 601,
      createdAt: '2026-03-01T10:00:00.000Z',
      offeringId: 500,
      ownerType: 'trainer',
      ownerId: 400,
      trainerId: 400,
      sportId: 2,
      title: 'Утренняя тренировка',
      date: '2026-04-01',
      startTime: '10:00',
      endTime: '11:00',
      durationMinutes: 60,
      level: 'all_levels',
      capacity: 1,
      bookedCount: 0,
      price: 2000,
      room: 'Зал №3',
    },
  ];
}

/* ========================================
   Тесты reverse-mapping клуба
   ======================================== */

describe('mapClubToFormState (Step 15.2)', () => {
  it('маппит основные поля клуба в ClubFormState', () => {
    const club = makeClub();
    const offering = makeClubOffering();
    const schedules = makeClubSchedules();

    const form = mapClubToFormState(club, offering, schedules);

    expect(form.name).toBe('FitZone Studio');
    expect(form.city).toBe('Москва');
    expect(form.address).toBe('ул. Спортивная, 10');
    expect(form.description).toBe(club.description);
    expect(form.phone).toBe('+7 (999) 123-45-67');
    expect(form.email).toBe('info@fitzone.ru');
    expect(form.priceFrom).toBe('1200');
  });

  it('восстанавливает sportIds из sportIds клуба', () => {
    const club = makeClub({ sportIds: [1, 4] });
    const form = mapClubToFormState(club, makeClubOffering(), []);

    expect(form.sportIds).toContain(1);
    expect(form.sportIds).toContain(4);
    expect(form.sportIds).toHaveLength(2);
  });

  it('сохраняет tagIds и amenityIds', () => {
    const club = makeClub({
      tagIds: [1, 2],
      amenityIds: [1, 2],
    });
    const form = mapClubToFormState(club, makeClubOffering(), []);

    expect(form.tagIds).toEqual([1, 2]);
    expect(form.amenityIds).toEqual([1, 2]);
  });

  it('маппит schedule slots с сохранением id', () => {
    const club = makeClub();
    const offering = makeClubOffering();
    const schedules = makeClubSchedules();

    const form = mapClubToFormState(club, offering, schedules);

    expect(form.scheduleSlots).toHaveLength(2);

    // Первый слот
    expect(form.scheduleSlots[0].id).toBe(301);
    expect(form.scheduleSlots[0].title).toBe('Утренняя йога');
    expect(form.scheduleSlots[0].date).toBe('2026-04-01');
    expect(form.scheduleSlots[0].startTime).toBe('08:00');
    expect(form.scheduleSlots[0].endTime).toBe('09:00');
    expect(form.scheduleSlots[0].price).toBe('900');
    expect(form.scheduleSlots[0].capacity).toBe('15');
    expect(form.scheduleSlots[0].location).toBe('Зал №1');

    // Второй слот
    expect(form.scheduleSlots[1].id).toBe(302);
    expect(form.scheduleSlots[1].title).toBe('Кроссфит');
  });

  it('восстанавливает sportId слота напрямую из Schedule.sportId', () => {
    const schedules = makeClubSchedules(); // sportId: 1 (Йога), sportId: 4 (Кроссфит)
    const form = mapClubToFormState(makeClub(), makeClubOffering(), schedules);

    expect(form.scheduleSlots[0].sportId).toBe(1);
    expect(form.scheduleSlots[1].sportId).toBe(4);
  });

  it('обрабатывает клуб без email (undefined → пустая строка)', () => {
    const club = makeClub();
    delete (club as unknown as Record<string, unknown>).email;
    const form = mapClubToFormState(club, makeClubOffering(), []);

    expect(form.email).toBe('');
  });

  it('обрабатывает пустой массив schedules', () => {
    const form = mapClubToFormState(makeClub(), makeClubOffering(), []);

    expect(form.scheduleSlots).toEqual([]);
  });
});

/* ========================================
   Тесты reverse-mapping тренера
   ======================================== */

describe('mapTrainerToFormState (Step 15.2)', () => {
  it('маппит основные поля тренера в TrainerFormState', () => {
    const trainer = makeTrainer();
    const offering = makeTrainerOffering();
    const schedules = makeTrainerSchedules();

    const form = mapTrainerToFormState(trainer, offering, schedules);

    expect(form.firstName).toBe('Александр');
    expect(form.lastName).toBe('Иванов');
    expect(form.city).toBe('Москва');
    expect(form.address).toBe('ул. Спортивная, 10');
    expect(form.bio).toBe(trainer.bio);
    expect(form.experience).toBe('5');
  });

  it('восстанавливает sportIds из sportIds тренера', () => {
    const trainer = makeTrainer({ sportIds: [2] }); // Бокс
    const form = mapTrainerToFormState(trainer, makeTrainerOffering(), []);

    expect(form.sportIds).toEqual([2]);
  });

  it('восстанавливает specialtyIds из specialtyIds тренера', () => {
    const trainer = makeTrainer({ specialtyIds: [1, 2] });
    const form = mapTrainerToFormState(trainer, makeTrainerOffering(), []);

    expect(form.specialtyIds).toEqual([1, 2]);
  });

  it('восстанавливает offering-поля из primary offering', () => {
    const offering = makeTrainerOffering({
      title: 'Персональная тренировка',
      description: 'Индивидуальная тренировка по боксу',
      format: 'personal',
      price: 2000,
      durationMinutes: 60,
      address: 'Зал №3',
    });
    const form = mapTrainerToFormState(makeTrainer(), offering, []);

    expect(form.offeringName).toBe('Персональная тренировка');
    expect(form.offeringDescription).toBe('Индивидуальная тренировка по боксу');
    expect(form.offeringFormat).toBe('Индивидуальная');
    expect(form.offeringPrice).toBe('2000');
    expect(form.offeringDuration).toBe('60');
    expect(form.offeringLocation).toBe('Зал №3');
  });

  it('восстанавливает все offering-форматы: personal, group, mini_group', () => {
    const personalForm = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering({ format: 'personal' }),
      [],
    );
    expect(personalForm.offeringFormat).toBe('Индивидуальная');

    const groupForm = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering({ format: 'group' }),
      [],
    );
    expect(groupForm.offeringFormat).toBe('Групповая');

    const miniGroupForm = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering({ format: 'mini_group' }),
      [],
    );
    expect(miniGroupForm.offeringFormat).toBe('Мини-группа');
  });

  it('Phase 25 Step 25.1b: восстанавливает clubId из confirmed TrainerClubLink', () => {
    const confirmedLink = {
      id: 700,
      createdAt: '2026-03-01T00:00:00.000Z',
      trainerId: 400,
      clubId: 100,
      status: 'confirmed' as const,
      initiatedBy: 'trainer' as const,
    };
    const form = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      [],
      [],
      [confirmedLink],
    );

    expect(form.clubId).toBe(100);
  });

  it('clubId = null если нет confirmed TrainerClubLink', () => {
    const form = mapTrainerToFormState(makeTrainer(), makeTrainerOffering(), [], [], []);
    expect(form.clubId).toBeNull();
  });

  it('восстанавливает workFormatIds из workFormatIds тренера', () => {
    const form = mapTrainerToFormState(makeTrainer(), makeTrainerOffering(), []);

    // workFormatIds восстанавливается из persisted-сущности
    expect(Array.isArray(form.workFormatIds)).toBe(true);
    expect(form.workFormatIds.length).toBeGreaterThan(0);
  });

  it('маппит schedule slots тренера с сохранением id', () => {
    const form = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      makeTrainerSchedules(),
    );

    expect(form.scheduleSlots).toHaveLength(1);
    expect(form.scheduleSlots[0].id).toBe(601);
    expect(form.scheduleSlots[0].title).toBe('Утренняя тренировка');
    expect(form.scheduleSlots[0].date).toBe('2026-04-01');
    expect(form.scheduleSlots[0].startTime).toBe('10:00');
    expect(form.scheduleSlots[0].endTime).toBe('11:00');
    expect(form.scheduleSlots[0].price).toBe('2000');
    expect(form.scheduleSlots[0].capacity).toBe('1');
    expect(form.scheduleSlots[0].location).toBe('Зал №3');
    expect(form.scheduleSlots[0].sportId).toBe(2);
  });

  /* --- Phase 25 Step 25.1a: mapping additionalOfferings + trainer-club-links --- */

  it('без additionalOfferings параметра — form.additionalOfferings отсутствует (backward-compat)', () => {
    const form = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      makeTrainerSchedules(),
    );
    expect(form.additionalOfferings).toBeUndefined();
  });

  it('с пустым массивом additionalOfferings — form.additionalOfferings = []', () => {
    const form = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      makeTrainerSchedules(),
      [],
    );
    expect(form.additionalOfferings).toEqual([]);
  });

  it('маппит additionalOfferings в TrainerOfferingFormItem[] с правильными полями', () => {
    const extraOffering: Offering = {
      id: 501,
      createdAt: '2026-03-05T10:00:00.000Z',
      ownerType: 'trainer',
      ownerId: 400,
      sportId: 2,
      title: 'Дополнительная услуга',
      description: 'Описание дополнительной услуги',
      format: 'group',
      price: 1500,
      durationMinutes: 90,
      capacity: 5,
      address: 'Другой адрес',
      cancellationPolicy: 'free_anytime',
    };
    const extraSchedule: Schedule = {
      id: 602,
      createdAt: '2026-03-05T10:00:00.000Z',
      offeringId: 501,
      ownerType: 'trainer',
      ownerId: 400,
      trainerId: 400,
      sportId: 2,
      title: 'Групповая тренировка',
      date: '2026-04-10',
      startTime: '15:00',
      endTime: '16:30',
      durationMinutes: 90,
      level: 'all_levels',
      capacity: 5,
      bookedCount: 0,
      price: 1500,
      room: 'Групповой зал',
    };

    const form = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      makeTrainerSchedules(),
      [{ offering: extraOffering, schedules: [extraSchedule] }],
    );

    expect(form.additionalOfferings).toHaveLength(1);
    const item = form.additionalOfferings![0];
    expect(item.id).toBe(501);
    expect(item.title).toBe('Дополнительная услуга');
    expect(item.description).toBe('Описание дополнительной услуги');
    expect(item.format).toBe('Групповая');
    expect(item.price).toBe('1500');
    expect(item.duration).toBe('90');
    expect(item.location).toBe('Другой адрес');
    expect(item.cancellationPolicy).toBe('free_anytime');
    expect(item.attachmentMode).toBe('private');
    expect(item.clubLinkId).toBeUndefined();
    expect(item.scheduleSlots).toHaveLength(1);
    expect(item.scheduleSlots[0].id).toBe(602);
    expect(item.scheduleSlots[0].title).toBe('Групповая тренировка');
  });

  it('резолвит attachmentMode=club и clubLinkId по trainerClubLinkId offering + confirmed link', () => {
    const confirmedLinkId = 701;
    const extraOffering: Offering = {
      id: 501,
      createdAt: '2026-03-05T10:00:00.000Z',
      ownerType: 'trainer',
      ownerId: 400,
      sportId: 2,
      title: 'Клубная услуга',
      description: 'В клубе',
      format: 'group',
      price: 1500,
      durationMinutes: 60,
      capacity: 5,
      address: 'Адрес клуба',
      cancellationPolicy: 'free_until_24h',
      trainerClubLinkId: confirmedLinkId,
    };

    const confirmedLink = {
      id: confirmedLinkId,
      createdAt: '2026-03-01T00:00:00.000Z',
      trainerId: 400,
      clubId: 100,
      status: 'confirmed' as const,
      initiatedBy: 'trainer' as const,
      approvedAt: '2026-03-02T00:00:00.000Z',
      approvedByUserId: 2,
    };

    const form = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      makeTrainerSchedules(),
      [{ offering: extraOffering, schedules: [] }],
      [confirmedLink],
    );

    expect(form.additionalOfferings).toHaveLength(1);
    expect(form.additionalOfferings![0].attachmentMode).toBe('club');
    expect(form.additionalOfferings![0].clubLinkId).toBe(confirmedLinkId);
  });

  it('если trainerClubLinkId указан, но нет confirmed link — attachmentMode=private (fallback)', () => {
    const extraOffering: Offering = {
      id: 501,
      createdAt: '2026-03-05T10:00:00.000Z',
      ownerType: 'trainer',
      ownerId: 400,
      sportId: 2,
      title: 'Услуга с revoked link',
      description: 'desc',
      format: 'personal',
      price: 2000,
      durationMinutes: 60,
      capacity: 1,
      address: 'addr',
      cancellationPolicy: 'free_until_24h',
      trainerClubLinkId: 777,
    };
    // Передаём revoked link — не должно резолвиться как club.
    const revokedLink = {
      id: 777,
      createdAt: '2026-03-01T00:00:00.000Z',
      trainerId: 400,
      clubId: 100,
      status: 'revoked' as const,
      initiatedBy: 'trainer' as const,
    };

    const form = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      makeTrainerSchedules(),
      [{ offering: extraOffering, schedules: [] }],
      [revokedLink],
    );

    expect(form.additionalOfferings![0].attachmentMode).toBe('private');
    expect(form.additionalOfferings![0].clubLinkId).toBeUndefined();
  });
});

/* ========================================
   Roundtrip: persisted → form-state → payload
   ======================================== */

describe('roundtrip: persisted → form-state сохраняет schedule slot id (Step 15.2)', () => {
  it('schedule slot id переносится из persisted Schedule в ScheduleSlotForm', () => {
    const clubSchedules = makeClubSchedules();
    const clubForm = mapClubToFormState(makeClub(), makeClubOffering(), clubSchedules);

    // id существующих слотов сохраняются
    expect(clubForm.scheduleSlots[0].id).toBe(clubSchedules[0].id);
    expect(clubForm.scheduleSlots[1].id).toBe(clubSchedules[1].id);

    const trainerSchedules = makeTrainerSchedules();
    const trainerForm = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      trainerSchedules,
    );
    expect(trainerForm.scheduleSlots[0].id).toBe(trainerSchedules[0].id);
  });

  it('числовые поля persisted-сущностей конвертируются в строки для формы', () => {
    const clubForm = mapClubToFormState(makeClub(), makeClubOffering(), makeClubSchedules());

    // priceFrom: number → string
    expect(typeof clubForm.priceFrom).toBe('string');
    // slot.price: number → string
    expect(typeof clubForm.scheduleSlots[0].price).toBe('string');
    // slot.capacity: number → string
    expect(typeof clubForm.scheduleSlots[0].capacity).toBe('string');

    const trainerForm = mapTrainerToFormState(
      makeTrainer(),
      makeTrainerOffering(),
      makeTrainerSchedules(),
    );
    // experience: number → string
    expect(typeof trainerForm.experience).toBe('string');
    // offeringPrice: number → string
    expect(typeof trainerForm.offeringPrice).toBe('string');
    // offeringDuration: number → string
    expect(typeof trainerForm.offeringDuration).toBe('string');
  });
});
