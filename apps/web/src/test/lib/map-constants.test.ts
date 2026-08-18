// Тесты констант карты и seed-данных (Step 19.1, обновлён Step 23.4)
// Проверяют наличие констант карты, города из cities.json и seed-пользователей
import { describe, expect, it } from 'vitest';

import { DEFAULT_CITY, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@sporthub/types';
import { getCities, getUsers } from '@/lib/db';

describe('константы карты', () => {
  it('DEFAULT_MAP_CENTER содержит координаты Самары', () => {
    expect(DEFAULT_MAP_CENTER).toEqual({ lat: 53.195878, lng: 50.100202 });
  });

  it('DEFAULT_MAP_ZOOM — целое число больше 0', () => {
    expect(DEFAULT_MAP_ZOOM).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_MAP_ZOOM)).toBe(true);
  });

  it('getCities() — возвращает массив с хотя бы одним городом', async () => {
    const cities = await getCities();
    expect(Array.isArray(cities)).toBe(true);
    expect(cities.length).toBeGreaterThan(0);
  });

  it('getCities() содержит Самару как дефолтный город', async () => {
    const cities = await getCities();
    const samara = cities.find((c) => c.name === DEFAULT_CITY);
    expect(samara).toBeDefined();
    expect(samara!.coordinates.lat).toBeCloseTo(53.195878, 2);
    expect(samara!.coordinates.lng).toBeCloseTo(50.100202, 2);
  });

  it('каждый город из getCities() имеет name и coordinates', async () => {
    const cities = await getCities();
    for (const city of cities) {
      expect(city.name).toBeTruthy();
      expect(typeof city.coordinates.lat).toBe('number');
      expect(typeof city.coordinates.lng).toBe('number');
    }
  });
});

describe('seed-данные: город пользователей', () => {
  it('athlete (id=1) имеет город Самара', async () => {
    const users = await getUsers();
    const athlete = users.find((u) => u.id === 1);
    expect(athlete).toBeDefined();
    expect(athlete!.city).toBe('Самара');
  });

  it('provider (id=2) имеет город Самара', async () => {
    const users = await getUsers();
    const provider = users.find((u) => u.id === 2);
    expect(provider).toBeDefined();
    expect(provider!.city).toBe('Самара');
  });

  it('admin (id=3) может не иметь города', async () => {
    const users = await getUsers();
    const admin = users.find((u) => u.id === 3);
    expect(admin).toBeDefined();
    // admin может не иметь города — это допустимо
  });
});
