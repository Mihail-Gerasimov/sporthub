// Тесты Zod-схемы слотов расписания — шаг 10 мин, sportId, cross-field refine (Step 23.9)
import { describe, expect, it } from 'vitest';

import { publishClubSchema, publishTrainerSchema } from '@sporthub/domain';

/* --- Хелперы: минимальные валидные payload --- */

/** Минимальный валидный слот с sportId */
function validSlot(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Утренняя тренировка',
    date: '2026-04-01',
    startTime: '09:00',
    endTime: '10:00',
    price: '2500',
    capacity: '10',
    location: 'Зал №1',
    sportId: 1,
    ...overrides,
  };
}

/** Минимальный валидный payload клуба */
function validClubPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'FitZone',
    city: 'Москва',
    address: 'ул. Ленина, 1',
    description:
      'Современный фитнес-клуб с тренажёрным залом, групповыми программами и зоной кроссфита. Работаем для вас.',
    phone: '+7 (495) 300-00-01',
    email: '',
    priceFrom: '1200',
    sportIds: [1, 2],
    tagIds: [1],
    amenityIds: [1],
    vk: '',
    telegram: '',
    facebook: '',
    scheduleSlots: [validSlot({ sportId: 1 })],
    userId: 1,
    ...overrides,
  };
}

/** Минимальный валидный payload тренера */
function validTrainerPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Иван',
    lastName: 'Петров',
    city: 'Москва',
    address: 'ул. Спортивная, 5',
    bio: 'Персональный тренер по боксу. Готовлю к соревнованиям и работаю с начинающими. Стаж более 8 лет.',
    experience: '8',
    sportIds: [2],
    specialtyIds: [1],
    workFormatIds: [1],
    phone: '+7 (495) 300-00-02',
    vk: '',
    telegram: '',
    facebook: '',
    offeringName: 'Тренировка по боксу',
    offeringDescription: 'Индивидуальное занятие',
    offeringFormat: 'Индивидуальная',
    offeringPrice: '2500',
    offeringDuration: '60',
    offeringLocation: 'Зал единоборств',
    clubId: null,
    scheduleSlots: [validSlot({ sportId: 2 })],
    userId: 1,
    ...overrides,
  };
}

describe('Schedule slot schema — шаг 10 мин (Step 23.9)', () => {
  /* --- Валидные значения времени (кратные 10 минутам) --- */

  it.each(['00:00', '08:00', '09:30', '10:00', '11:30', '14:00', '17:50', '23:50'])(
    'принимает валидное время %s (кратное 10 мин)',
    (time) => {
      const result = publishClubSchema.safeParse(
        validClubPayload({
          scheduleSlots: [validSlot({ startTime: time, endTime: '23:50' })],
        }),
      );
      // Если ошибка есть, она не должна быть связана с startTime
      if (!result.success) {
        const timeErrors = result.error.issues.filter((i) => i.path.some((p) => p === 'startTime'));
        expect(timeErrors).toHaveLength(0);
      }
    },
  );

  /* --- Невалидные значения времени (не кратные 10) --- */

  it.each(['08:01', '09:15', '10:05', '14:17', '17:33', '23:59'])(
    'отклоняет невалидное время %s (не кратное 10 мин)',
    (time) => {
      const result = publishClubSchema.safeParse(
        validClubPayload({
          scheduleSlots: [validSlot({ startTime: time })],
        }),
      );
      expect(result.success).toBe(false);
    },
  );

  it('отклоняет endTime не кратное 10 минутам', () => {
    const result = publishClubSchema.safeParse(
      validClubPayload({
        scheduleSlots: [validSlot({ endTime: '10:15' })],
      }),
    );
    expect(result.success).toBe(false);
  });

  /* --- Тренерская схема тоже проверяет шаг 10 мин --- */

  it('publishTrainerSchema отклоняет startTime не кратное 10', () => {
    const result = publishTrainerSchema.safeParse(
      validTrainerPayload({
        scheduleSlots: [validSlot({ sportId: 2, startTime: '14:17' })],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe('Schedule slot schema — sportId вместо discipline (Step 23.9)', () => {
  it('принимает слот с sportId (число)', () => {
    const result = publishClubSchema.safeParse(
      validClubPayload({
        scheduleSlots: [validSlot({ sportId: 1 })],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('отклоняет слот без sportId', () => {
    const slot = validSlot();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sportId: _, ...slotWithoutSportId } = slot;
    const result = publishClubSchema.safeParse(
      validClubPayload({
        scheduleSlots: [slotWithoutSportId],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('отклоняет слот с sportId = 0', () => {
    const result = publishClubSchema.safeParse(
      validClubPayload({
        scheduleSlots: [validSlot({ sportId: 0 })],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe('Cross-field refine: slot.sportId ∈ publication.sportIds (Step 23.9)', () => {
  it('принимает payload когда slot.sportId входит в sportIds', () => {
    const result = publishClubSchema.safeParse(
      validClubPayload({
        sportIds: [1, 2],
        scheduleSlots: [validSlot({ sportId: 1 }), validSlot({ sportId: 2 })],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('отклоняет payload когда slot.sportId НЕ входит в sportIds', () => {
    const result = publishClubSchema.safeParse(
      validClubPayload({
        sportIds: [1, 2],
        scheduleSlots: [validSlot({ sportId: 999 })],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      expect(msg).toContain('направлен');
    }
  });

  it('publishTrainerSchema отклоняет slot.sportId не в sportIds', () => {
    const result = publishTrainerSchema.safeParse(
      validTrainerPayload({
        sportIds: [2],
        scheduleSlots: [validSlot({ sportId: 99 })],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('сообщение ошибки содержит понятный текст о направлении и слотах', () => {
    const result = publishClubSchema.safeParse(
      validClubPayload({
        sportIds: [1],
        scheduleSlots: [validSlot({ sportId: 3 })],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      expect(msg).toMatch(/направлен/i);
    }
  });
});
