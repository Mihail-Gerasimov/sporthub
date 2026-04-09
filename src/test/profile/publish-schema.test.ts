// Тесты Zod-схем publish (Step 18.2)
// Проверяют серверную валидацию: email, телефон, санитизация, длительность
import { describe, expect, it } from 'vitest';

import { publishClubSchema, publishTrainerSchema } from '@/lib/schemas/publish';

// --- Хелпер: минимально валидный payload клуба ---

function validClubPayload() {
  return {
    name: 'FitZone Studio',
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    description:
      'Современный клуб с большим залом, групповыми программами и стабильным расписанием для новичков и продвинутых.',
    phone: '+7 (999) 123-45-67',
    email: 'info@club.ru',
    priceFrom: '500',
    disciplines: ['Йога'],
    tags: [],
    amenities: [],
    scheduleSlots: [
      {
        title: 'Утренняя йога',
        date: '2026-04-01',
        startTime: '08:00',
        endTime: '09:00',
        price: '900',
        capacity: '12',
        location: 'Зал №1',
        discipline: 'Йога',
      },
    ],
    userId: 2,
  };
}

// --- Хелпер: минимально валидный payload тренера ---

function validTrainerPayload() {
  return {
    firstName: 'Александр',
    lastName: 'Иванов',
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    bio: 'Опытный тренер по боксу с большим стажем, который работает с новичками и готовит спортсменов к турнирам.',
    experience: '5',
    sport: 'Бокс',
    specializations: ['Персональные тренировки'],
    workFormat: 'В клубе',
    offeringName: 'Персональная тренировка',
    offeringDescription: 'Индивидуальное занятие по технике, защите и работе на лапах.',
    offeringFormat: 'Индивидуальная',
    offeringPrice: '2000',
    offeringDuration: '60',
    offeringLocation: 'Зал №3',
    clubId: null,
    scheduleSlots: [
      {
        title: 'Утренняя тренировка',
        date: '2026-04-01',
        startTime: '09:00',
        endTime: '10:00',
        price: '2000',
        capacity: '1',
        location: 'Зал №3',
        discipline: 'Бокс',
      },
    ],
    userId: 2,
  };
}

describe('publishClubSchema (Zod)', () => {
  it('принимает валидный payload', () => {
    const result = publishClubSchema.safeParse(validClubPayload());
    expect(result.success).toBe(true);
  });

  it('отклоняет невалидный email', () => {
    const result = publishClubSchema.safeParse({ ...validClubPayload(), email: 'не-email' });
    expect(result.success).toBe(false);
  });

  it('принимает пустой email (необязательное поле)', () => {
    const result = publishClubSchema.safeParse({ ...validClubPayload(), email: '' });
    expect(result.success).toBe(true);
  });

  it('отклоняет невалидный формат телефона', () => {
    const result = publishClubSchema.safeParse({ ...validClubPayload(), phone: '123' });
    expect(result.success).toBe(false);
  });

  it('принимает валидный телефон', () => {
    const result = publishClubSchema.safeParse({
      ...validClubPayload(),
      phone: '+7 (999) 123-45-67',
    });
    expect(result.success).toBe(true);
  });
});

describe('publishTrainerSchema (Zod)', () => {
  it('принимает валидный payload', () => {
    const result = publishTrainerSchema.safeParse(validTrainerPayload());
    expect(result.success).toBe(true);
  });

  it('отклоняет длительность не кратную 5', () => {
    const result = publishTrainerSchema.safeParse({
      ...validTrainerPayload(),
      offeringDuration: '51',
    });
    expect(result.success).toBe(false);
  });

  it('принимает длительность кратную 5', () => {
    const result55 = publishTrainerSchema.safeParse({
      ...validTrainerPayload(),
      offeringDuration: '55',
    });
    expect(result55.success).toBe(true);

    const result60 = publishTrainerSchema.safeParse({
      ...validTrainerPayload(),
      offeringDuration: '60',
    });
    expect(result60.success).toBe(true);
  });
});
