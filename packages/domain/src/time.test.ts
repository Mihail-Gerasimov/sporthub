// Проверка общего помощника времени.
//
// Главное, что здесь проверяется, — независимость от пояса процесса. Прежние функции
// проходили любые тесты именно потому, что тест и код строили момент одной и той же
// неверной формулой и сдвигались одинаково. Здесь ожидания записаны в UTC явно,
// поэтому подмена пояса процесса сразу видна.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getDateKeyInTimeZone,
  getSlotEndAt,
  getSlotStartAt,
  getTimeKeyInTimeZone,
  getWeekStartKey,
  hoursUntilSlotStart,
  isSlotAhead,
  isSlotUpcoming,
  shiftDateKey,
  zonedDateTime,
} from './time';

const SLOT = { date: '2026-08-20', startTime: '10:00', endTime: '11:30' };

describe('Момент занятия', () => {
  it('строит момент по часам зала, а не по поясу процесса', () => {
    // Самара — UTC+4, значит 10:00 в зале это 06:00 UTC.
    expect(getSlotStartAt(SLOT).toISOString()).toBe('2026-08-20T06:00:00.000Z');
    expect(getSlotEndAt(SLOT).toISOString()).toBe('2026-08-20T07:30:00.000Z');
  });

  it('даёт тот же ответ при любом поясе процесса', () => {
    const expected = getSlotStartAt(SLOT).toISOString();
    const original = process.env.TZ;

    for (const zone of ['UTC', 'Europe/Samara', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      expect(getSlotStartAt(SLOT).toISOString()).toBe(expected);
    }

    process.env.TZ = original;
  });

  it('учитывает переход на летнее время в поясах, где он есть', () => {
    // Берлин: зимой UTC+1, летом UTC+2. Одно и то же время в зале даёт разные моменты.
    expect(zonedDateTime('2026-01-15', '12:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-01-15T11:00:00.000Z',
    );
    expect(zonedDateTime('2026-07-15', '12:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-07-15T10:00:00.000Z',
    );
  });

  it('считает часы до начала занятия', () => {
    const now = new Date('2026-08-20T05:00:00.000Z');

    expect(hoursUntilSlotStart(SLOT, now)).toBe(1);
  });

  it('не молчит на неразборчивых значениях', () => {
    expect(() => zonedDateTime('позавчера', '10:00')).toThrow(/разобрать/);
  });
});

describe('Календарные ключи', () => {
  it('называет день по часам зала', () => {
    // 22:00 UTC — это уже 02:00 следующего дня в Самаре.
    expect(getDateKeyInTimeZone(new Date('2026-08-20T22:00:00.000Z'))).toBe('2026-08-21');
    expect(getTimeKeyInTimeZone(new Date('2026-08-20T22:00:00.000Z'))).toBe('02:00');
  });

  it('сдвигает день, не спотыкаясь о границу месяца и года', () => {
    expect(shiftDateKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDateKey('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('находит понедельник недели, включая воскресенье', () => {
    expect(getWeekStartKey('2026-08-20')).toBe('2026-08-17'); // четверг
    expect(getWeekStartKey('2026-08-17')).toBe('2026-08-17'); // сам понедельник
    expect(getWeekStartKey('2026-08-23')).toBe('2026-08-17'); // воскресенье
  });
});

describe('Занятие ещё не прошло', () => {
  it('сравнивает по часам зала', () => {
    // 07:00 UTC = 11:00 в Самаре, занятие идёт до 11:30 — ещё не прошло.
    expect(isSlotUpcoming(SLOT, new Date('2026-08-20T07:00:00.000Z'))).toBe(true);
    // 07:31 UTC = 11:31 — уже закончилось.
    expect(isSlotUpcoming(SLOT, new Date('2026-08-20T07:31:00.000Z'))).toBe(false);
    expect(isSlotUpcoming(SLOT, new Date('2026-08-19T23:00:00.000Z'))).toBe(true);
  });
});

describe('Занятие ещё не началось (38.81)', () => {
  it('сравнивает начало по часам зала: идущее занятие уже не впереди', () => {
    // 05:59 UTC = 09:59 в Самаре — до начала минута.
    expect(isSlotAhead(SLOT, new Date('2026-08-20T05:59:00.000Z'))).toBe(true);
    // 06:00 UTC = 10:00 — началось ровно сейчас: записываться поздно.
    expect(isSlotAhead(SLOT, new Date('2026-08-20T06:00:00.000Z'))).toBe(false);
    // 07:00 UTC = 11:00 — идёт (ещё не прошло по `isSlotUpcoming`), но не впереди.
    expect(isSlotAhead(SLOT, new Date('2026-08-20T07:00:00.000Z'))).toBe(false);
    expect(isSlotUpcoming(SLOT, new Date('2026-08-20T07:00:00.000Z'))).toBe(true);
    // Другой день — по календарю: вчера нет, завтра да.
    expect(isSlotAhead(SLOT, new Date('2026-08-21T01:00:00.000Z'))).toBe(false);
    expect(isSlotAhead(SLOT, new Date('2026-08-19T23:00:00.000Z'))).toBe(true);
  });
});

describe('Пояс процесса не влияет ни на что', () => {
  const original = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });

  afterAll(() => {
    process.env.TZ = original;
  });

  it('день, время и понедельник считаются одинаково', () => {
    expect(getDateKeyInTimeZone(new Date('2026-08-20T22:00:00.000Z'))).toBe('2026-08-21');
    expect(getWeekStartKey('2026-08-23')).toBe('2026-08-17');
    expect(getSlotStartAt(SLOT).toISOString()).toBe('2026-08-20T06:00:00.000Z');
  });
});
