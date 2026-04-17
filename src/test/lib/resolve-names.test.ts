// Тесты хелперов resolveNames и buildDictMap — резолвинг EntityId[] → string[] (Step 23.10)
import { describe, expect, it } from 'vitest';

import { buildDictMap, resolveNames } from '@/lib/utils';

/* --- buildDictMap --- */

describe('buildDictMap', () => {
  it('строит Map из массива объектов с id', () => {
    const items = [
      { id: 1, name: 'Йога' },
      { id: 2, name: 'Бокс' },
      { id: 3, name: 'Плавание' },
    ];
    const map = buildDictMap(items);

    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(3);
    expect(map.get(1)).toEqual({ id: 1, name: 'Йога' });
    expect(map.get(2)).toEqual({ id: 2, name: 'Бокс' });
    expect(map.get(3)).toEqual({ id: 3, name: 'Плавание' });
  });

  it('возвращает пустой Map для пустого массива', () => {
    const map = buildDictMap([]);
    expect(map.size).toBe(0);
  });

  it('последний элемент с тем же id выигрывает (дедупликация)', () => {
    const items = [
      { id: 1, name: 'Старое' },
      { id: 1, name: 'Новое' },
    ];
    const map = buildDictMap(items);
    expect(map.size).toBe(1);
    expect(map.get(1)?.name).toBe('Новое');
  });
});

/* --- resolveNames --- */

describe('resolveNames', () => {
  const dict = [
    { id: 1, name: 'Йога' },
    { id: 2, name: 'Бокс' },
    { id: 3, name: 'Плавание' },
    { id: 4, name: 'Кроссфит' },
  ];

  it('резолвит массив id в массив имён', () => {
    expect(resolveNames([1, 3], dict)).toEqual(['Йога', 'Плавание']);
  });

  it('сохраняет порядок id', () => {
    expect(resolveNames([3, 1, 2], dict)).toEqual(['Плавание', 'Йога', 'Бокс']);
  });

  it('пропускает неизвестные id (не ломается)', () => {
    expect(resolveNames([1, 999, 3], dict)).toEqual(['Йога', 'Плавание']);
  });

  it('возвращает пустой массив для пустых ids', () => {
    expect(resolveNames([], dict)).toEqual([]);
  });

  it('возвращает пустой массив для пустого справочника', () => {
    expect(resolveNames([1, 2], [])).toEqual([]);
  });

  it('работает с одним id', () => {
    expect(resolveNames([4], dict)).toEqual(['Кроссфит']);
  });
});
