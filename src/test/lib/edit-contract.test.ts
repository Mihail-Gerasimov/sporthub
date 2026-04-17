// Тесты update-контракта редактирования публикаций (Step 15.1)
// Проверяют: shared form-state, edit payload, scope ограничения
import { describe, expect, it } from 'vitest';

import type { ScheduleSlotForm, ClubFormState, TrainerFormState } from '@/lib/schemas/publish';
import { publishClubSchema, publishTrainerSchema } from '@/lib/schemas/publish';

/* ========================================
   Shared form-state типы
   ======================================== */

describe('shared form-state типы (Step 15.1)', () => {
  it('ScheduleSlotForm поддерживает опциональное поле id для edit-flow', () => {
    // Слот без id — создание нового
    const newSlot: ScheduleSlotForm = {
      title: 'Утренняя йога',
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '09:00',
      price: '900',
      capacity: '15',
      location: 'Зал №1',
      discipline: 'Йога',
    };

    expect(newSlot.id).toBeUndefined();

    // Слот с id — редактирование существующего
    const existingSlot: ScheduleSlotForm = {
      ...newSlot,
      id: 42,
    };

    expect(existingSlot.id).toBe(42);
  });

  it('ClubFormState содержит все активные MVP-поля клуба', () => {
    const form: ClubFormState = {
      name: 'FitZone Studio',
      city: 'Москва',
      address: 'ул. Спортивная, 10',
      description:
        'Описание клуба длиной более пятидесяти символов для прохождения валидации формы.',
      phone: '+7 (999) 123-45-67',
      email: 'info@fitzone.ru',
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
          discipline: 'Йога',
        },
      ],
    };

    // Все поля присутствуют
    expect(form.name).toBe('FitZone Studio');
    expect(form.scheduleSlots).toHaveLength(1);
    expect(form.sportIds).toContain(1);
  });

  it('TrainerFormState содержит все активные MVP-поля тренера', () => {
    const form: TrainerFormState = {
      firstName: 'Александр',
      lastName: 'Иванов',
      city: 'Москва',
      address: 'ул. Спортивная, 10',
      bio: 'Описание тренера длиной более пятидесяти символов для прохождения валидации формы публикации.',
      experience: '5',
      sportIds: [2],
      specialtyIds: [1],
      workFormatIds: [1],
      phone: '+7 (846) 300-00-11',
      vk: '',
      telegram: '',
      facebook: '',
      offeringName: 'Персональная тренировка',
      offeringDescription: 'Индивидуальная тренировка',
      offeringFormat: 'Индивидуальная',
      offeringPrice: '2000',
      offeringDuration: '60',
      offeringLocation: 'Зал №3',
      clubId: null,
      scheduleSlots: [
        {
          title: 'Утренняя тренировка',
          date: '2026-04-01',
          startTime: '10:00',
          endTime: '11:00',
          price: '2000',
          capacity: '1',
          location: 'Зал №3',
          discipline: 'Бокс',
        },
      ],
    };

    expect(form.firstName).toBe('Александр');
    expect(form.specialtyIds).toContain(1);
    expect(form.clubId).toBeNull();
  });
});

/* ========================================
   Edit payload — та же Zod-схема, что и create
   ======================================== */

describe('edit payload использует те же Zod-схемы, что и create (Step 15.1)', () => {
  const validClubPayload = {
    name: 'FitZone Studio',
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    description: 'Описание клуба длиной более пятидесяти символов для прохождения валидации формы.',
    phone: '+7 (999) 123-45-67',
    email: '',
    priceFrom: '1200',
    sportIds: [1],
    tagIds: [],
    amenityIds: [],
    vk: '',
    telegram: '',
    facebook: '',
    scheduleSlots: [
      {
        title: 'Йога',
        date: '2026-04-01',
        startTime: '08:00',
        endTime: '09:00',
        price: '900',
        capacity: '15',
        location: 'Зал №1',
        discipline: 'Йога',
      },
    ],
    userId: 2,
  };

  const validTrainerPayload = {
    firstName: 'Александр',
    lastName: 'Иванов',
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    bio: 'Описание тренера длиной более пятидесяти символов для прохождения валидации формы публикации.',
    experience: '5',
    sportIds: [2],
    specialtyIds: [1],
    workFormatIds: [1],
    phone: '+7 (846) 300-00-11',
    vk: '',
    telegram: '',
    facebook: '',
    offeringName: 'Персональная тренировка',
    offeringDescription: 'Индивидуальная тренировка',
    offeringFormat: 'Индивидуальная',
    offeringPrice: '2000',
    offeringDuration: '60',
    offeringLocation: 'Зал №3',
    clubId: null,
    scheduleSlots: [
      {
        title: 'Тренировка',
        date: '2026-04-01',
        startTime: '10:00',
        endTime: '11:00',
        price: '2000',
        capacity: '1',
        location: 'Зал №3',
        discipline: 'Бокс',
      },
    ],
    userId: 2,
  };

  it('publishClubSchema принимает полный валидный payload (full replace)', () => {
    const result = publishClubSchema.safeParse(validClubPayload);
    expect(result.success).toBe(true);
  });

  it('publishClubSchema отклоняет partial payload без обязательных полей', () => {
    const { name: _name, ...partial } = validClubPayload;
    const result = publishClubSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });

  it('publishTrainerSchema принимает полный валидный payload (full replace)', () => {
    const result = publishTrainerSchema.safeParse(validTrainerPayload);
    expect(result.success).toBe(true);
  });

  it('publishTrainerSchema отклоняет partial payload без обязательных полей', () => {
    const { firstName: _firstName, ...partial } = validTrainerPayload;
    const result = publishTrainerSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });

  it('edit payload не содержит slug, createdAt, status и других системных полей', () => {
    // Zod-схема не принимает системные поля (strict не используется, но поля не парсятся)
    const clubResult = publishClubSchema.safeParse(validClubPayload);
    expect(clubResult.success).toBe(true);
    if (clubResult.success) {
      const parsed = clubResult.data;
      expect('slug' in parsed).toBe(false);
      expect('createdAt' in parsed).toBe(false);
      expect('status' in parsed).toBe(false);
      expect('rating' in parsed).toBe(false);
      expect('reviewCount' in parsed).toBe(false);
      expect('imageUrls' in parsed).toBe(false);
    }
  });
});

/* ========================================
   Future/stub-поля игнорируются edit-flow
   ======================================== */

describe('future/stub-поля не участвуют в edit-flow (Step 15.1)', () => {
  it('Zod-схема клуба не включает future-поля (website, socialLinks и т.д.)', () => {
    const shape = publishClubSchema.shape;
    expect('website' in shape).toBe(false);
    expect('socialLinks' in shape).toBe(false);
    expect('fullDescription' in shape).toBe(false);
    expect('isFeatured' in shape).toBe(false);
  });

  it('Zod-схема тренера не включает future-поля (certificates, achievements и т.д.)', () => {
    const shape = publishTrainerSchema.shape;
    expect('certificates' in shape).toBe(false);
    expect('achievements' in shape).toBe(false);
    expect('videoGallery' in shape).toBe(false);
    expect('onlineFormat' in shape).toBe(false);
  });
});
