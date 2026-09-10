// Сравнение расписания формы с исходным (шаг 36.9).
//
// От этого сравнения зависит, попадёт ли `scheduleSlots` в тело правки, а от
// этого — уцелеют ли записи людей. Ложное «не менялось» тише всего: правка
// расписания просто не доедет до сервера, и человек увидит прежние слоты.

import { describe, expect, it } from 'vitest';

import type { ScheduleSlotForm } from '@sporthub/domain';

import { scheduleChanged } from '@/components/profile/schedule-changes';

const slot = (overrides: Partial<ScheduleSlotForm> = {}): ScheduleSlotForm => ({
  id: 1,
  title: 'Утро',
  date: '2026-10-01',
  startTime: '09:00',
  endTime: '10:00',
  price: '1000',
  capacity: '10',
  location: 'Зал 1',
  sportId: 1,
  ...overrides,
});

describe('scheduleChanged', () => {
  it('нетронутое расписание считается неизменным', () => {
    const initial = [slot(), slot({ id: 2, title: 'Вечер' })];
    const current = [slot(), slot({ id: 2, title: 'Вечер' })];

    expect(scheduleChanged(current, initial)).toBe(false);
  });

  it('правка любого поля слота видна', () => {
    expect(scheduleChanged([slot({ startTime: '10:00' })], [slot()])).toBe(true);
    expect(scheduleChanged([slot({ price: '2000' })], [slot()])).toBe(true);
    expect(scheduleChanged([slot({ location: 'Зал 2' })], [slot()])).toBe(true);
    expect(scheduleChanged([slot({ sportId: 2 })], [slot()])).toBe(true);
  });

  it('добавленный и убранный слот видны', () => {
    expect(scheduleChanged([slot(), slot({ id: 2 })], [slot()])).toBe(true);
    expect(scheduleChanged([], [slot()])).toBe(true);
  });

  it('перестановка слотов считается правкой', () => {
    // Порядок в теле определяет, какой слот с каким сопоставится по номеру.
    const first = slot({ id: 1, title: 'Утро' });
    const second = slot({ id: 2, title: 'Вечер' });

    expect(scheduleChanged([second, first], [first, second])).toBe(true);
  });

  it('без исходного расписания считается изменённым', () => {
    // Создание публикации: сравнивать не с чем, а расписание там обязательно.
    expect(scheduleChanged([slot()], undefined)).toBe(true);
  });

  it('новый слот без номера отличается от существующего с номером', () => {
    expect(scheduleChanged([slot({ id: undefined })], [slot({ id: 7 })])).toBe(true);
  });
});
