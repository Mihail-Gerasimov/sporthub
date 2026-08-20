// Тесты ключа сравнения текста: регистр, краевые пробелы и кириллица,
// включая «Ё» — букву, на которой регистронезависимость чаще всего ломается.
import { describe, expect, it } from 'vitest';

import { normalizeMatchKey } from './text-normalization';

describe('normalizeMatchKey', () => {
  it('опускает регистр латиницы', () => {
    expect(normalizeMatchKey('SportHub')).toBe('sporthub');
  });

  it('опускает регистр кириллицы', () => {
    expect(normalizeMatchKey('САМАРА')).toBe('самара');
    expect(normalizeMatchKey('саМаРа')).toBe('самара');
  });

  it('снимает краевые пробелы', () => {
    expect(normalizeMatchKey('  Москва  ')).toBe('москва');
  });

  it('приводит «Ё» к «ё», не сливая её с «е»', () => {
    expect(normalizeMatchKey('КОРОЛЁВ')).toBe('королёв');
    expect(normalizeMatchKey('Королёв')).not.toBe(normalizeMatchKey('Королев'));
  });

  it('даёт один ключ для написаний одного города', () => {
    expect(normalizeMatchKey('  сАнкт-ПЕТЕРБУРГ ')).toBe(normalizeMatchKey('Санкт-Петербург'));
  });

  it('пустую строку и пробелы приводит к пустому ключу', () => {
    expect(normalizeMatchKey('')).toBe('');
    expect(normalizeMatchKey('   ')).toBe('');
  });
});
