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

describe('Устойчивость порядка при равных метках', () => {
  it('при совпадающих метках времени порядок задаёт номер, а не случай', () => {
    // Именно этот случай ломается при переезде: `Array.prototype.sort` в движке
    // устойчива и сохраняла порядок вставки, а `ORDER BY` в базе — нет.
    const sameMoment = '2026-08-20T10:00:00.000Z';
    const items = [
      { id: 3, createdAt: sameMoment },
      { id: 1, createdAt: sameMoment },
      { id: 2, createdAt: sameMoment },
    ];

    expect([...items].sort(compareByCreatedAtDesc).map((item) => item.id)).toEqual([3, 2, 1]);
    // Порядок на входе на результат не влияет — иначе он был бы случайным.
    expect(
      [...items]
        .reverse()
        .sort(compareByCreatedAtDesc)
        .map((item) => item.id),
    ).toEqual([3, 2, 1]);
  });

  it('кириллица в соседних полях порядку не мешает', () => {
    const items = [
      { id: 1, createdAt: '2026-08-20T10:00:00.000Z', name: 'Ёлка' },
      { id: 2, createdAt: '2026-08-21T10:00:00.000Z', name: 'ёж' },
      { id: 3, createdAt: '2026-08-19T10:00:00.000Z', name: 'Арена' },
    ];

    expect(items.sort(compareByCreatedAtDesc).map((item) => item.name)).toEqual([
      'ёж',
      'Ёлка',
      'Арена',
    ]);
  });
});
