// Тесты create-контракта публикации тренера (Step 14.4)
// Phase 25 Step 25.1a: +кейсы на additionalOfferings в update-контракте.
import { describe, expect, it } from 'vitest';

import {
  mapTrainerFormToEntities,
  mapTrainerFormToUpdateInput,
} from '@/lib/contracts/publish-trainer';
import type { TrainerOfferingFormItem } from '@/lib/schemas/publish';

/* Минимальная валидная форма тренера */
const validForm = {
  firstName: 'Александр',
  lastName: 'Иванов',
  city: 'Москва',
  address: 'ул. Спортивная, 10',
  bio: 'Персональный тренер по боксу. Готовлю к соревнованиям и работаю с начинающими. Стаж более 8 лет.',
  experience: '8',
  sportIds: [2],
  specialtyIds: [1, 2],
  workFormatIds: [1],
  phone: '+7 (846) 300-00-11',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная тренировка по боксу',
  offeringDescription: 'Индивидуальное занятие: техника ударов, защита, работа на снарядах.',
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
    {
      title: 'Вечерняя тренировка',
      date: '2026-04-01',
      startTime: '18:00',
      endTime: '19:30',
      price: '2500',
      capacity: '1',
      location: 'Зал единоборств',
      sportId: 2,
    },
  ],
};

const PROVIDER_USER_ID = 2;

describe('publish-trainer contract (Step 14.4)', () => {
  /* --- Trainer mapping --- */

  it('маппит форму в тренера с корректными полями', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);

    expect(trainer.name).toBe('Александр Иванов');
    expect(trainer.city).toBe('Москва');
    expect(trainer.address).toBe('ул. Спортивная, 10');
    expect(trainer.bio).toBe(validForm.bio);
    expect(trainer.experienceYears).toBe(8);
    expect(trainer.specialtyIds).toEqual([1, 2]);
    expect(trainer.priceFrom).toBe(2500);
  });

  it('генерирует slug из name (kebab-case, lowercase)', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    expect(trainer.slug).toBe('александр-иванов');
  });

  it('маппит sportIds → sportIds напрямую', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    // sportIds: [2] — Бокс
    expect(trainer.sportIds).toEqual([2]);
  });

  it('выставляет source = provider, status = published', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    expect(trainer.source).toBe('provider');
    expect(trainer.status).toBe('published');
  });

  it('выставляет managedByUserId из аргумента', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    expect(trainer.managedByUserId).toBe(2);
  });

  it('ставит safe defaults: coordinates, avatarUrl, rating, reviewCount', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);

    expect(trainer.coordinates).toEqual({ lat: 0, lng: 0 });
    expect(trainer.avatarUrl).toBe('');
    expect(trainer.rating).toBe(0);
    expect(trainer.reviewCount).toBe(0);
  });

  it('генерирует id и createdAt', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);

    expect(trainer.id).toBeTypeOf('number');
    expect(trainer.id).toBeGreaterThan(0);
    expect(trainer.createdAt).toBeTruthy();
  });

  /* --- Optional club link (Phase 25 Step 25.1b: через отдельное поле clubId) --- */

  it('без clubId — в результате нет поля clubId', () => {
    const result = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    expect((result as unknown as Record<string, unknown>).clubId).toBeUndefined();
  });

  it('с clubId — передаётся в отдельное поле clubId создания (для авто-создания confirmed link)', () => {
    const formWithClub = { ...validForm, clubId: 42 };
    const result = mapTrainerFormToEntities(formWithClub, PROVIDER_USER_ID);
    expect((result as unknown as { clubId?: number }).clubId).toBe(42);
  });

  /* --- Offering mapping --- */

  it('создаёт trainer offering (ownerType=trainer)', () => {
    const { offering, trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);

    expect(offering.ownerType).toBe('trainer');
    expect(offering.ownerId).toBe(trainer.id);
    expect(offering.title).toBe('Персональная тренировка по боксу');
    expect(offering.description).toBe(validForm.offeringDescription);
    expect(offering.price).toBe(2500);
    expect(offering.durationMinutes).toBe(60);
    expect(offering.address).toBe('Зал единоборств');
    expect(offering.coordinates).toEqual({ lat: 0, lng: 0 });
  });

  it('маппит offeringFormat в format offering', () => {
    const { offering } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    // «Индивидуальная» → 'personal'
    expect(offering.format).toBe('personal');
  });

  it('offering с clubId — больше НЕ проставляет legacy affiliatedClubId (Phase 25 Step 25.1b)', () => {
    const formWithClub = { ...validForm, clubId: 42 };
    const { offering } = mapTrainerFormToEntities(formWithClub, PROVIDER_USER_ID);
    // Legacy поле удалено из типа Offering; связь теперь живёт в TrainerClubLink.
    expect((offering as unknown as Record<string, unknown>).affiliatedClubId).toBeUndefined();
  });

  /* --- Schedule mapping --- */

  it('создаёт schedule[] из scheduleSlots формы', () => {
    const { schedules } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    expect(schedules).toHaveLength(2);
  });

  it('каждый schedule имеет корректные поля из формы', () => {
    const { schedules, trainer, offering } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);

    const s0 = schedules[0];
    expect(s0.title).toBe('Утренняя тренировка');
    expect(s0.date).toBe('2026-04-01');
    expect(s0.startTime).toBe('09:00');
    expect(s0.endTime).toBe('10:00');
    expect(s0.price).toBe(2500);
    expect(s0.capacity).toBe(1);
    expect(s0.room).toBe('Зал единоборств');
    expect(s0.bookedCount).toBe(0);
    expect(s0.level).toBe('all_levels');
    expect(s0.durationMinutes).toBe(60);

    // Связи
    expect(s0.ownerType).toBe('trainer');
    expect(s0.ownerId).toBe(trainer.id);
    expect(s0.trainerId).toBe(trainer.id);
    expect(s0.offeringId).toBe(offering.id);
    expect(s0.sportId).toBe(2); // Бокс

    const s1 = schedules[1];
    expect(s1.title).toBe('Вечерняя тренировка');
    expect(s1.durationMinutes).toBe(90);
  });

  /* --- Неизвестный спорт --- */

  it('пустой sportIds → пустой sportIds', () => {
    const formEmpty = { ...validForm, sportIds: [] };
    const { trainer } = mapTrainerFormToEntities(formEmpty, PROVIDER_USER_ID);
    expect(trainer.sportIds).toEqual([]);
  });

  /* --- Future/stub-поля не в контракте --- */

  it('workFormatIds попадает в persisted trainer', () => {
    const { trainer } = mapTrainerFormToEntities(validForm, PROVIDER_USER_ID);
    // workFormatIds теперь сохраняется в Trainer
    expect(trainer.workFormatIds).toEqual([1]);
  });

  /* --- Phase 25 Step 25.1a: update-контракт с additionalOfferings --- */

  it('mapTrainerFormToUpdateInput без additionalOfferings — поле отсутствует в payload', () => {
    const result = mapTrainerFormToUpdateInput(validForm, 42, PROVIDER_USER_ID);
    expect(result.trainerId).toBe(42);
    expect(result.userId).toBe(PROVIDER_USER_ID);
    expect(result.additionalOfferings).toBeUndefined();
  });

  it('mapTrainerFormToUpdateInput с additionalOfferings=[] — передаёт пустой массив для удаления', () => {
    const formWithEmpty = {
      ...validForm,
      additionalOfferings: [] as TrainerOfferingFormItem[],
    };
    const result = mapTrainerFormToUpdateInput(formWithEmpty, 42, PROVIDER_USER_ID);
    expect(result.additionalOfferings).toEqual([]);
  });

  it('mapTrainerFormToUpdateInput с новыми additionalOfferings — offering без id', () => {
    const newOffering: TrainerOfferingFormItem = {
      title: 'Новая услуга',
      description: 'Описание новой услуги',
      format: 'Групповая',
      price: '1500',
      duration: '90',
      location: 'Зал А',
      cancellationPolicy: 'free_until_24h',
      attachmentMode: 'private',
      scheduleSlots: [
        {
          title: 'Групповая тренировка',
          date: '2026-05-01',
          startTime: '10:00',
          endTime: '11:30',
          price: '1500',
          capacity: '5',
          location: 'Зал А',
          sportId: 2,
        },
      ],
    };
    const result = mapTrainerFormToUpdateInput(
      { ...validForm, additionalOfferings: [newOffering] },
      42,
      PROVIDER_USER_ID,
    );
    expect(result.additionalOfferings).toHaveLength(1);
    const entry = result.additionalOfferings![0];
    expect(entry.offering.id).toBeUndefined();
    expect(entry.offering.title).toBe('Новая услуга');
    expect(entry.offering.format).toBe('group');
    expect(entry.offering.price).toBe(1500);
    expect(entry.offering.durationMinutes).toBe(90);
    expect(entry.offering.cancellationPolicy).toBe('free_until_24h');
    expect(entry.schedules).toHaveLength(1);
    expect(entry.schedules[0].title).toBe('Групповая тренировка');
  });

  it('mapTrainerFormToUpdateInput с существующей additional (с id) — сохраняет id для update', () => {
    const existingOffering: TrainerOfferingFormItem = {
      id: 501,
      title: 'Существующая услуга',
      description: 'Описание',
      format: 'Индивидуальная',
      price: '2000',
      duration: '60',
      location: 'Зал Б',
      cancellationPolicy: 'no_refund',
      attachmentMode: 'club',
      clubLinkId: 777,
      scheduleSlots: [
        {
          id: 1010,
          title: 'Индивидуальная',
          date: '2026-05-02',
          startTime: '11:00',
          endTime: '12:00',
          price: '2000',
          capacity: '1',
          location: 'Зал Б',
          sportId: 2,
        },
      ],
    };
    const result = mapTrainerFormToUpdateInput(
      { ...validForm, additionalOfferings: [existingOffering] },
      42,
      PROVIDER_USER_ID,
    );
    const entry = result.additionalOfferings![0];
    expect(entry.offering.id).toBe(501);
    expect(entry.offering.trainerClubLinkId).toBe(777);
    expect(entry.offering.cancellationPolicy).toBe('no_refund');
    expect(entry.schedules[0].id).toBe(1010);
  });
});
