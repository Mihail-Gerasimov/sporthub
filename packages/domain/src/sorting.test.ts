// Тесты компаратора «свежие первыми». Главное здесь — тай-брейкер по id:
// без него порядок при равных метках времени зависит от реализации сортировки.
import { describe, expect, it } from 'vitest';

import { compareByCreatedAtDesc } from './sorting';

type Row = { id: number; createdAt: string };

describe('compareByCreatedAtDesc', () => {
  it('ставит более свежую запись первой', () => {
    const older: Row = { id: 1, createdAt: '2026-01-01T00:00:00.000Z' };
    const newer: Row = { id: 2, createdAt: '2026-02-01T00:00:00.000Z' };

    expect([older, newer].sort(compareByCreatedAtDesc)).toEqual([newer, older]);
  });

  it('при равных метках времени ставит первым больший id', () => {
    const first: Row = { id: 5, createdAt: '2026-01-01T00:00:00.000Z' };
    const second: Row = { id: 7, createdAt: '2026-01-01T00:00:00.000Z' };
    const third: Row = { id: 6, createdAt: '2026-01-01T00:00:00.000Z' };

    expect([first, second, third].sort(compareByCreatedAtDesc).map((row) => row.id)).toEqual([
      7, 6, 5,
    ]);
  });

  it('порядок не зависит от исходного порядка элементов', () => {
    const rows: Row[] = [
      { id: 1, createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 2, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 3, createdAt: '2026-01-02T00:00:00.000Z' },
    ];

    const straight = [...rows].sort(compareByCreatedAtDesc).map((row) => row.id);
    const reversed = [...rows]
      .reverse()
      .sort(compareByCreatedAtDesc)
      .map((row) => row.id);

    expect(straight).toEqual([3, 1, 2]);
    expect(reversed).toEqual(straight);
  });

  it('возвращает 0 только для полностью совпадающей пары', () => {
    const row: Row = { id: 1, createdAt: '2026-01-01T00:00:00.000Z' };

    expect(compareByCreatedAtDesc(row, { ...row })).toBe(0);
  });
});
