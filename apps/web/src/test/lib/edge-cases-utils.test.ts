// Тесты edge cases утилит Phase 19 (Step 19.9)
// formatCityTitleCase — нормализация регистра города, isValidCoordinates — проверка координат
import { describe, expect, it } from 'vitest';

import { formatCityTitleCase, isValidCoordinates } from '@/lib/utils';

/* ========================================
   1. formatCityTitleCase — edge cases
   ======================================== */

describe('formatCityTitleCase edge cases (Step 19.9)', () => {
  it('пустая строка → пустая строка', () => {
    expect(formatCityTitleCase('')).toBe('');
  });

  it('только пробелы → пустая строка', () => {
    expect(formatCityTitleCase('   ')).toBe('');
  });

  it('все строчные → первая заглавная', () => {
    expect(formatCityTitleCase('самара')).toBe('Самара');
  });

  it('все заглавные → первая заглавная, остальные строчные', () => {
    expect(formatCityTitleCase('САМАРА')).toBe('Самара');
  });

  it('смешанный регистр → нормализованный', () => {
    expect(formatCityTitleCase('саМаРа')).toBe('Самара');
  });

  it('город с дефисом — обе части с заглавной', () => {
    expect(formatCityTitleCase('санкт-петербург')).toBe('Санкт-Петербург');
  });

  it('город с дефисом — uppercase → нормализованный', () => {
    expect(formatCityTitleCase('САНКТ-ПЕТЕРБУРГ')).toBe('Санкт-Петербург');
  });

  it('уже нормализованный — без изменений', () => {
    expect(formatCityTitleCase('Самара')).toBe('Самара');
    expect(formatCityTitleCase('Санкт-Петербург')).toBe('Санкт-Петербург');
  });

  it('пробелы по краям обрезаются', () => {
    expect(formatCityTitleCase('  москва  ')).toBe('Москва');
  });

  it('Тольятти — корректно нормализуется', () => {
    expect(formatCityTitleCase('тольятти')).toBe('Тольятти');
  });
});

/* ========================================
   2. isValidCoordinates — edge cases
   ======================================== */

describe('isValidCoordinates edge cases (Step 19.9)', () => {
  it('undefined → false', () => {
    expect(isValidCoordinates(undefined)).toBe(false);
  });

  it('{lat: 0, lng: 0} → false (заглушка)', () => {
    expect(isValidCoordinates({ lat: 0, lng: 0 })).toBe(false);
  });

  it('{lat: 53, lng: 0} → false (одна координата нулевая)', () => {
    expect(isValidCoordinates({ lat: 53, lng: 0 })).toBe(false);
  });

  it('{lat: 0, lng: 50} → false (одна координата нулевая)', () => {
    expect(isValidCoordinates({ lat: 0, lng: 50 })).toBe(false);
  });

  it('валидные координаты Самары → true', () => {
    expect(isValidCoordinates({ lat: 53.195878, lng: 50.100202 })).toBe(true);
  });

  it('валидные координаты Москвы → true', () => {
    expect(isValidCoordinates({ lat: 55.7558, lng: 37.6173 })).toBe(true);
  });

  it('отрицательные координаты → true (допустимы по формату)', () => {
    expect(isValidCoordinates({ lat: -33.8688, lng: 151.2093 })).toBe(true);
  });
});
