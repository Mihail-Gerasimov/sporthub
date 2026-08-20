// Проверка мапперов границы.
//
// Каждый случай здесь — способ, которым переезд ломает поведение молча: ответ
// остаётся с кодом 200, форма похожа, а значение уже другое.

import { describe, expect, it } from 'vitest';

import {
  diffIdSets,
  fromDateKey,
  fromTimeKey,
  omitEmptyArrays,
  omitNulls,
  toDateKey,
  toIsoString,
  toNullable,
  toOptionalIsoString,
  toTimeKey,
} from './prisma-mappers';

describe('День и время занятия', () => {
  it('день возвращается прежней строкой', () => {
    // Драйвер отдаёт день полуночью по UTC.
    expect(toDateKey(new Date('2026-08-20T00:00:00.000Z'))).toBe('2026-08-20');
    expect(fromDateKey('2026-08-20').toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });

  it('время возвращается прежней строкой', () => {
    // Драйвер отдаёт время тем же временем 1 января 1970 года.
    expect(toTimeKey(new Date('1970-01-01T10:00:00.000Z'))).toBe('10:00');
    expect(fromTimeKey('10:00').toISOString()).toBe('1970-01-01T10:00:00.000Z');
  });

  it('оба преобразования не зависят от пояса процесса', () => {
    const original = process.env.TZ;

    for (const zone of ['UTC', 'Europe/Samara', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      expect(toDateKey(fromDateKey('2026-01-01'))).toBe('2026-01-01');
      expect(toTimeKey(fromTimeKey('23:45'))).toBe('23:45');
    }

    process.env.TZ = original;
  });

  it('не молчат на неразборчивых значениях', () => {
    expect(() => fromDateKey('вчера')).toThrow(/разобрать дату/);
    expect(() => fromTimeKey('поздно')).toThrow(/разобрать время/);
  });
});

describe('Метки времени', () => {
  it('отдаются строкой, а не объектом даты', () => {
    expect(toIsoString(new Date('2026-08-20T08:00:00.000Z'))).toBe('2026-08-20T08:00:00.000Z');
    expect(toOptionalIsoString(null)).toBeUndefined();
  });
});

describe('Пустое значение против отсутствия ключа', () => {
  it('пустые значения выбрасываются из ответа', () => {
    expect(omitNulls({ id: 1, hiddenAt: null, note: undefined, city: 'Самара' })).toEqual({
      id: 1,
      city: 'Самара',
    });
  });

  it('ноль и пустая строка остаются — они значения, а не пустота', () => {
    expect(omitNulls({ rating: 0, note: '', flag: false })).toEqual({
      rating: 0,
      note: '',
      flag: false,
    });
  });

  it('пустая коллекция выбрасывается, непустая остаётся', () => {
    expect(omitEmptyArrays({ sportIds: [], tagIds: [3], name: 'Клуб' })).toEqual({
      tagIds: [3],
      name: 'Клуб',
    });
  });
});

describe('Стирание поля правкой', () => {
  it('отсутствие значения превращается в явное «пусто»', () => {
    // Иначе снятие причины скрытия перестало бы работать: база проигнорировала бы правку.
    expect(toNullable(undefined)).toBeNull();
    expect(toNullable('причина')).toBe('причина');
    expect(toNullable(0)).toBe(0);
  });
});

describe('Наборы ссылок', () => {
  it('считает добавленное и убранное, а не переписывает целиком', () => {
    expect(diffIdSets([1, 8, 5], [8, 5, 9])).toEqual({ added: [9], removed: [1] });
  });

  it('на совпадающих наборах не делает ничего', () => {
    expect(diffIdSets([1, 2], [2, 1])).toEqual({ added: [], removed: [] });
  });

  it('пустой новый набор убирает всё', () => {
    expect(diffIdSets([4, 7], [])).toEqual({ added: [], removed: [4, 7] });
  });
});
