// Тесты хелперов карты (Step 19.1, дополнено Step 23.5)
// normalizeCity — нормализация регистра города
// isValidCoordinates — валидация координат для маркеров
// getCityBoundingBox — bounding box вокруг центра города
import { describe, expect, it } from 'vitest';

import { getCityBoundingBox, isValidCoordinates, normalizeCity } from '@/lib/utils';

describe('normalizeCity', () => {
  it('нормализует lowercase → каноничный вид', () => {
    expect(normalizeCity('самара')).toBe('Самара');
  });

  it('нормализует UPPERCASE → каноничный вид', () => {
    expect(normalizeCity('САМАРА')).toBe('Самара');
  });

  it('нормализует смешанный регистр → каноничный вид', () => {
    expect(normalizeCity('саМара')).toBe('Самара');
  });

  it('оставляет уже корректное значение без изменений', () => {
    expect(normalizeCity('Самара')).toBe('Самара');
  });

  it('обрабатывает город с дефисом', () => {
    expect(normalizeCity('санкт-петербург')).toBe('Санкт-Петербург');
  });

  it('обрабатывает город с дефисом в верхнем регистре', () => {
    expect(normalizeCity('САНКТ-ПЕТЕРБУРГ')).toBe('Санкт-Петербург');
  });

  it('обрезает лишние пробелы', () => {
    expect(normalizeCity('  самара  ')).toBe('Самара');
  });

  it('возвращает пустую строку для пустого ввода', () => {
    expect(normalizeCity('')).toBe('');
    expect(normalizeCity('   ')).toBe('');
  });
});

describe('isValidCoordinates', () => {
  it('возвращает false для undefined', () => {
    expect(isValidCoordinates(undefined)).toBe(false);
  });

  it('возвращает false для нулевых координат {0, 0}', () => {
    expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(false);
  });

  it('возвращает true для реальных координат Самары', () => {
    expect(isValidCoordinates({ lat: 53.195878, lng: 50.100202 })).toBe(true);
  });

  it('возвращает true для реальных координат Москвы', () => {
    expect(isValidCoordinates({ lat: 55.7558, lng: 37.6173 })).toBe(true);
  });

  it('возвращает false если только lat === 0', () => {
    expect(isValidCoordinates({ lat: 0, lng: 50.1 })).toBe(false);
  });

  it('возвращает false если только lng === 0', () => {
    expect(isValidCoordinates({ lat: 53.1, lng: 0 })).toBe(false);
  });
});

describe('getCityBoundingBox', () => {
  it('возвращает bounding box в формате [[lng1, lat1], [lng2, lat2]]', () => {
    const bbox = getCityBoundingBox({ lat: 53.195, lng: 50.1 });

    expect(bbox).toHaveLength(2);
    expect(bbox[0]).toHaveLength(2);
    expect(bbox[1]).toHaveLength(2);

    // Юго-западный угол (меньшие координаты)
    expect(bbox[0][0]).toBeLessThan(50.1);
    expect(bbox[0][1]).toBeLessThan(53.195);

    // Северо-восточный угол (большие координаты)
    expect(bbox[1][0]).toBeGreaterThan(50.1);
    expect(bbox[1][1]).toBeGreaterThan(53.195);
  });

  it('bounding box примерно ±15 км (~0.135° по широте)', () => {
    const bbox = getCityBoundingBox({ lat: 53.195, lng: 50.1 });

    const latDelta = bbox[1][1] - bbox[0][1];
    // 30 км ≈ 0.27° широты (±15 км)
    expect(latDelta).toBeCloseTo(0.27, 1);
  });

  it('bounding box для экватора: долгота ≈ широте', () => {
    const bbox = getCityBoundingBox({ lat: 0, lng: 30 });

    const latDelta = bbox[1][1] - bbox[0][1];
    const lngDelta = bbox[1][0] - bbox[0][0];

    // На экваторе 1° широты ≈ 1° долготы
    expect(Math.abs(latDelta - lngDelta)).toBeLessThan(0.01);
  });
});
