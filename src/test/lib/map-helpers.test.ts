// Тесты хелперов карты (Step 19.1)
// normalizeCity — нормализация регистра города
// isValidCoordinates — валидация координат для маркеров
import { describe, expect, it } from 'vitest';

import { isValidCoordinates, normalizeCity } from '@/lib/utils';

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
