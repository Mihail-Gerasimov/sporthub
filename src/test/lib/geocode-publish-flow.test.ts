// Тесты интеграции геокодирования в publish-flow (Step 19.3)
// Покрывают: Zod-схемы с координатами, контракты create/update, reverse-mapping
import { describe, expect, it } from 'vitest';

import { mapClubFormToEntities, mapClubFormToUpdateInput } from '@/lib/contracts/publish-club';
import {
  mapTrainerFormToEntities,
  mapTrainerFormToUpdateInput,
} from '@/lib/contracts/publish-trainer';
import { mapClubToFormState, mapTrainerToFormState } from '@/lib/contracts/reverse-mapping';
import { publishClubSchema, publishTrainerSchema } from '@/lib/schemas/publish';
import type { Club, Offering, Schedule, Trainer } from '@/types';

/* --- Фикстуры --- */

const PROVIDER_USER_ID = 2;

const validClubForm = {
  name: 'FitZone Studio',
  city: 'Самара',
  address: 'ул. Ленина, 42',
  description:
    'Современный фитнес-клуб с тренажёрным залом, групповыми программами и зоной кроссфита. Работаем для тех, кто хочет тренироваться.',
  phone: '+7 (846) 300-00-01',
  email: 'hello@fitzone.ru',
  priceFrom: '1200',
  sportIds: [1, 4],
  tagIds: [1],
  amenityIds: [1],
  vk: '',
  telegram: '',
  facebook: '',
  scheduleSlots: [
    {
      title: 'Утренняя йога',
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '09:00',
      price: '900',
      capacity: '15',
      location: 'Зал №1',
      sportId: 1,
    },
  ],
};

const validTrainerForm = {
  firstName: 'Александр',
  lastName: 'Иванов',
  city: 'Москва',
  address: 'ул. Спортивная, 10',
  bio: 'Персональный тренер по боксу. Готовлю к соревнованиям и работаю с начинающими. Стаж более 8 лет.',
  experience: '8',
  sportIds: [2],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (846) 300-00-11',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Тренировка по боксу',
  offeringDescription: 'Индивидуальное занятие',
  offeringFormat: 'Индивидуальная',
  offeringPrice: '2500',
  offeringDuration: '60',
  offeringLocation: 'Зал единоборств',
  clubId: null as number | null,
  scheduleSlots: [
    {
      title: 'Утренняя тренировка',
      date: '2026-04-01',
      startTime: '09:00',
      endTime: '10:00',
      price: '2500',
      capacity: '1',
      location: 'Зал единоборств',
      sportId: 2,
    },
  ],
};

/* --- Persisted-фикстуры для reverse-mapping --- */

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: 100,
    createdAt: '2026-03-01T10:00:00.000Z',
    name: 'FitZone Studio',
    slug: 'fitzone-studio',
    description: 'Описание клуба длиной более пятидесяти символов для прохождения валидации формы.',
    shortDescription: 'Описание клуба.',
    city: 'Самара',
    address: 'ул. Ленина, 42',
    phone: '+7 (846) 300-00-01',
    email: 'hello@fitzone.ru',
    coordinates: { lat: 53.195878, lng: 50.100202 },
    sportIds: [1, 4],
    imageUrls: [],
    amenityIds: [1],
    tagIds: [1],
    rating: 4.5,
    reviewCount: 12,
    priceFrom: 1200,
    distanceKm: 0,
    isFeatured: false,
    managedByUserId: 2,
    source: 'provider',
    status: 'published',
    ...overrides,
  };
}

function makeOffering(overrides: Partial<Offering> = {}): Offering {
  return {
    id: 200,
    createdAt: '2026-03-01T10:00:00.000Z',
    ownerType: 'club',
    ownerId: 100,
    affiliatedClubId: 100,
    sportId: 1,
    title: 'Занятия — FitZone Studio',
    description: 'Описание клуба.',
    format: 'group',
    price: 1200,
    durationMinutes: 60,
    capacity: 20,
    address: 'ул. Ленина, 42',
    coordinates: { lat: 53.195878, lng: 50.100202 },
    ...overrides,
  };
}

function makeSchedules(): Schedule[] {
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
  ];
}

function makeTrainer(overrides: Partial<Trainer> = {}): Trainer {
  return {
    id: 400,
    createdAt: '2026-03-01T10:00:00.000Z',
    name: 'Александр Иванов',
    slug: 'александр-иванов',
    bio: 'Описание тренера длиной более пятидесяти символов для прохождения валидации формы публикации.',
    avatarUrl: '',
    experienceYears: 8,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 4.8,
    reviewCount: 20,
    priceFrom: 2500,
    sportIds: [2],
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    coordinates: { lat: 55.7558, lng: 37.6173 },
    managedByUserId: 2,
    source: 'provider',
    status: 'published',
    ...overrides,
  };
}

function makeTrainerOffering(overrides: Partial<Offering> = {}): Offering {
  return {
    id: 500,
    createdAt: '2026-03-01T10:00:00.000Z',
    ownerType: 'trainer',
    ownerId: 400,
    sportId: 2,
    title: 'Тренировка по боксу',
    description: 'Индивидуальное занятие',
    format: 'personal',
    price: 2500,
    durationMinutes: 60,
    capacity: 1,
    address: 'Зал единоборств',
    coordinates: { lat: 55.7558, lng: 37.6173 },
    ...overrides,
  };
}

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
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      level: 'all_levels',
      capacity: 1,
      bookedCount: 0,
      price: 2500,
      room: 'Зал единоборств',
    },
  ];
}

/* ========================================
   1. Zod-схемы — опциональные coordinates
   ======================================== */

describe('Zod-схемы с опциональными координатами (Step 19.3)', () => {
  it('publishClubSchema принимает payload с coordinates', () => {
    const payload = {
      ...validClubForm,
      coordinates: { lat: 53.195878, lng: 50.100202 },
      userId: PROVIDER_USER_ID,
    };
    const result = publishClubSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
    }
  });

  it('publishClubSchema принимает payload без coordinates', () => {
    const payload = { ...validClubForm, userId: PROVIDER_USER_ID };
    const result = publishClubSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinates).toBeUndefined();
    }
  });

  it('publishTrainerSchema принимает payload с coordinates', () => {
    const payload = {
      ...validTrainerForm,
      coordinates: { lat: 55.7558, lng: 37.6173 },
      userId: PROVIDER_USER_ID,
    };
    const result = publishTrainerSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinates).toEqual({ lat: 55.7558, lng: 37.6173 });
    }
  });

  it('publishTrainerSchema принимает payload без coordinates', () => {
    const payload = { ...validTrainerForm, userId: PROVIDER_USER_ID };
    const result = publishTrainerSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinates).toBeUndefined();
    }
  });

  it('coordinates с невалидными значениями отклоняются', () => {
    const payload = {
      ...validClubForm,
      coordinates: { lat: 'not-a-number', lng: 50 },
      userId: PROVIDER_USER_ID,
    };
    const result = publishClubSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

/* ========================================
   2. Create-контракты — координаты из формы
   ======================================== */

describe('create-контракт клуба с координатами (Step 19.3)', () => {
  it('использует coordinates из формы когда заданы', () => {
    const formWithCoords = {
      ...validClubForm,
      coordinates: { lat: 53.195878, lng: 50.100202 },
    };
    const { club, offering } = mapClubFormToEntities(formWithCoords, PROVIDER_USER_ID);

    expect(club.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
    expect(offering.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
  });

  it('использует {0,0} когда coordinates не заданы', () => {
    const { club, offering } = mapClubFormToEntities(validClubForm, PROVIDER_USER_ID);

    expect(club.coordinates).toEqual({ lat: 0, lng: 0 });
    expect(offering.coordinates).toEqual({ lat: 0, lng: 0 });
  });
});

describe('create-контракт тренера с координатами (Step 19.3)', () => {
  it('использует coordinates из формы когда заданы', () => {
    const formWithCoords = {
      ...validTrainerForm,
      coordinates: { lat: 55.7558, lng: 37.6173 },
    };
    const { trainer, offering } = mapTrainerFormToEntities(formWithCoords, PROVIDER_USER_ID);

    expect(trainer.coordinates).toEqual({ lat: 55.7558, lng: 37.6173 });
    expect(offering.coordinates).toEqual({ lat: 55.7558, lng: 37.6173 });
  });

  it('использует {0,0} когда coordinates не заданы', () => {
    const { trainer, offering } = mapTrainerFormToEntities(validTrainerForm, PROVIDER_USER_ID);

    expect(trainer.coordinates).toEqual({ lat: 0, lng: 0 });
    expect(offering.coordinates).toEqual({ lat: 0, lng: 0 });
  });
});

/* ========================================
   3. Update-контракты — координаты в payload
   ======================================== */

describe('update-контракт клуба с координатами (Step 19.3)', () => {
  it('передаёт coordinates в update payload клуба и offering', () => {
    const formWithCoords = {
      ...validClubForm,
      coordinates: { lat: 53.195878, lng: 50.100202 },
    };
    const input = mapClubFormToUpdateInput(formWithCoords, 100, PROVIDER_USER_ID);

    expect(input.club.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
    expect(input.offering.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
  });

  it('не передаёт coordinates когда не заданы', () => {
    const input = mapClubFormToUpdateInput(validClubForm, 100, PROVIDER_USER_ID);

    expect(input.club.coordinates).toBeUndefined();
    expect(input.offering.coordinates).toBeUndefined();
  });
});

describe('update-контракт тренера с координатами (Step 19.3)', () => {
  it('передаёт coordinates в update payload тренера и offering', () => {
    const formWithCoords = {
      ...validTrainerForm,
      coordinates: { lat: 55.7558, lng: 37.6173 },
    };
    const input = mapTrainerFormToUpdateInput(formWithCoords, 400, PROVIDER_USER_ID);

    expect(input.trainer.coordinates).toEqual({ lat: 55.7558, lng: 37.6173 });
    expect(input.offering.coordinates).toEqual({ lat: 55.7558, lng: 37.6173 });
  });

  it('не передаёт coordinates когда не заданы', () => {
    const input = mapTrainerFormToUpdateInput(validTrainerForm, 400, PROVIDER_USER_ID);

    expect(input.trainer.coordinates).toBeUndefined();
    expect(input.offering.coordinates).toBeUndefined();
  });
});

/* ========================================
   4. Reverse-mapping — координаты обратно в form state
   ======================================== */

describe('reverse-mapping координат в form state (Step 19.3)', () => {
  it('mapClubToFormState восстанавливает coordinates из клуба', () => {
    const club = makeClub({ coordinates: { lat: 53.195878, lng: 50.100202 } });
    const form = mapClubToFormState(club, makeOffering(), makeSchedules());

    expect(form.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
  });

  it('mapClubToFormState — {0,0} координаты не попадают в form (undefined)', () => {
    const club = makeClub({ coordinates: { lat: 0, lng: 0 } });
    const form = mapClubToFormState(club, makeOffering(), makeSchedules());

    expect(form.coordinates).toBeUndefined();
  });

  it('mapTrainerToFormState восстанавливает coordinates из тренера', () => {
    const trainer = makeTrainer({ coordinates: { lat: 55.7558, lng: 37.6173 } });
    const form = mapTrainerToFormState(trainer, makeTrainerOffering(), makeTrainerSchedules());

    expect(form.coordinates).toEqual({ lat: 55.7558, lng: 37.6173 });
  });

  it('mapTrainerToFormState — без координат = undefined', () => {
    const trainer = makeTrainer();
    delete (trainer as unknown as Record<string, unknown>).coordinates;
    const form = mapTrainerToFormState(trainer, makeTrainerOffering(), makeTrainerSchedules());

    expect(form.coordinates).toBeUndefined();
  });

  it('mapTrainerToFormState — {0,0} координаты не попадают в form', () => {
    const trainer = makeTrainer({ coordinates: { lat: 0, lng: 0 } });
    const form = mapTrainerToFormState(trainer, makeTrainerOffering(), makeTrainerSchedules());

    expect(form.coordinates).toBeUndefined();
  });
});

/* ========================================
   5. Regression — существующий publish-flow не ломается
   ======================================== */

describe('regression: publish-flow без координат работает как раньше (Step 19.3)', () => {
  it('create club без coordinates — всё остальное как прежде', () => {
    const { club, offering, schedules } = mapClubFormToEntities(validClubForm, PROVIDER_USER_ID);

    expect(club.name).toBe('FitZone Studio');
    expect(club.city).toBe('Самара');
    expect(offering.ownerType).toBe('club');
    expect(schedules).toHaveLength(1);
  });

  it('create trainer без coordinates — всё остальное как прежде', () => {
    const { trainer, offering, schedules } = mapTrainerFormToEntities(
      validTrainerForm,
      PROVIDER_USER_ID,
    );

    expect(trainer.name).toBe('Александр Иванов');
    expect(trainer.city).toBe('Москва');
    expect(offering.ownerType).toBe('trainer');
    expect(schedules).toHaveLength(1);
  });
});
