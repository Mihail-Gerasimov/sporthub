// Тесты констант карты и общего набора данных (Step 19.1, обновлён Step 23.4).
//
// Справочник городов и пользователи берутся из `@sporthub/fixtures`: читать каталог
// данных фронт больше не умеет и не должен — им владеет бэкенд.
import { describe, expect, it } from 'vitest';

import { DEFAULT_CITY, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@sporthub/types';
import { fixtureCities, fixtureUsers } from '@sporthub/fixtures';

describe('константы карты', () => {
  it('DEFAULT_MAP_CENTER содержит координаты Самары', () => {
    expect(DEFAULT_MAP_CENTER).toEqual({ lat: 53.195878, lng: 50.100202 });
  });

  it('DEFAULT_MAP_ZOOM — целое число больше 0', () => {
    expect(DEFAULT_MAP_ZOOM).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_MAP_ZOOM)).toBe(true);
  });

  it('справочник городов не пуст', () => {
    expect(fixtureCities.length).toBeGreaterThan(0);
  });

  it('справочник городов содержит Самару как город по умолчанию', () => {
    const samara = fixtureCities.find((city) => city.name === DEFAULT_CITY);

    expect(samara).toBeDefined();
    expect(samara!.coordinates.lat).toBeCloseTo(53.195878, 2);
    expect(samara!.coordinates.lng).toBeCloseTo(50.100202, 2);
  });

  it('каждый город справочника имеет name и coordinates', () => {
    for (const city of fixtureCities) {
      expect(city.name).toBeTruthy();
      expect(typeof city.coordinates.lat).toBe('number');
      expect(typeof city.coordinates.lng).toBe('number');
    }
  });
});

describe('город пользователей', () => {
  it('athlete (id=1) имеет город Самара', () => {
    expect(fixtureUsers.find((user) => user.id === 1)?.city).toBe('Самара');
  });

  it('provider (id=2) имеет город Самара', () => {
    expect(fixtureUsers.find((user) => user.id === 2)?.city).toBe('Самара');
  });

  it('admin (id=3) может не иметь города', () => {
    // Отсутствие города — допустимое состояние, а не пропуск в данных.
    expect(fixtureUsers.find((user) => user.id === 3)).toBeDefined();
  });
});
