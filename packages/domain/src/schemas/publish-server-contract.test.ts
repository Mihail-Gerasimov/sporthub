// Сторож: схема не принимает полей, которых сервер не сохраняет.
//
// Шаг 36.9a, решение заказчика 21. Поле `additionalOfferings` жило в схеме
// публикации тренера и приходило с формы, а сервер его молча выбрасывал:
// ни одна дополнительная услуга никогда не сохранялась. Контракт обещал то,
// чего не происходит, — и обещание выглядело исполненным, потому что запрос
// возвращал 200.
//
// Сторож держит границу с двух сторон: поля нет в `shape` (контракт его
// не объявляет) и разбор его не пропускает наружу (клиент, собранный до этой
// правки, получит тело без поля, а не тело с полем-пустышкой).
//
// Добавляется сюда любое поле, про которое выяснилось то же самое: интерфейс
// его собирает, сервер его не сохраняет. Список — одно объявление.

import { describe, expect, it } from 'vitest';

import { editTrainerSchema, publishTrainerSchema } from './publish';

/**
 * Поля, которых сервер публикации тренера не сохраняет.
 * Пока такое поле числится здесь, схема не имеет права его объявлять.
 */
const FIELDS_SERVER_DOES_NOT_STORE = ['additionalOfferings'] as const;

/** Годный слот расписания: время кратно 10, направление из публикации. */
const slot = () => ({
  title: 'Тренировка',
  date: '2026-10-01',
  startTime: '09:00',
  endTime: '10:00',
  price: '1000',
  capacity: '10',
  location: 'Зал 1',
  sportId: 1,
});

/** Тело публикации тренера, годное по всем правилам схемы. */
const trainerPayload = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Марина',
  lastName: 'Соколова',
  city: 'Самара',
  address: 'ул. Лесная, 23',
  bio: 'Описание тренера длиной не меньше пятидесяти символов, чтобы схема его приняла.',
  experience: '9',
  sportIds: [1],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (846) 300-00-11',
  offeringName: 'Персональная тренировка',
  offeringDescription: 'Индивидуальная работа над техникой.',
  offeringFormat: 'Индивидуальная',
  offeringPrice: '1900',
  offeringDuration: '60',
  offeringLocation: 'Бассейн 1',
  clubId: null,
  scheduleSlots: [slot()],
  ...overrides,
});

/** Одна дополнительная услуга в том виде, в каком её слала форма до шага 36.9a. */
const legacyOffering = () => ({
  title: 'Доп. услуга',
  description: 'Описание доп. услуги',
  format: 'Индивидуальная',
  price: '1500',
  duration: '60',
  location: 'Зал 2',
  cancellationPolicy: 'free_until_24h',
  attachmentMode: 'private',
  scheduleSlots: [slot()],
});

describe('схема публикации тренера не объявляет полей, которых сервер не сохраняет', () => {
  it.each(FIELDS_SERVER_DOES_NOT_STORE)('publishTrainerSchema не имеет поля «%s»', (field) => {
    expect(Object.keys(publishTrainerSchema.shape)).not.toContain(field);
  });

  it.each(FIELDS_SERVER_DOES_NOT_STORE)('editTrainerSchema не имеет поля «%s»', (field) => {
    expect(Object.keys(editTrainerSchema.shape)).not.toContain(field);
  });

  it('разбор не пропускает наружу поле старого клиента', () => {
    const parsed = publishTrainerSchema.safeParse(
      trainerPayload({ additionalOfferings: [legacyOffering()] }),
    );

    expect(parsed.success).toBe(true);
    expect(parsed.success && Object.keys(parsed.data)).not.toContain('additionalOfferings');
  });

  it('правка тоже не пропускает поле старого клиента', () => {
    const { scheduleSlots: _slots, ...withoutSchedule } = trainerPayload();
    const parsed = editTrainerSchema.safeParse({
      ...withoutSchedule,
      additionalOfferings: [legacyOffering()],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && Object.keys(parsed.data)).not.toContain('additionalOfferings');
  });
});
