// Тесты display-хелперов (Step 18.3)
// Проверяют формат города с припиской «г.» и отсутствие приписки в хранении
import { describe, expect, it } from 'vitest';

import { formatCityDisplay } from '@/lib/utils';

describe('formatCityDisplay', () => {
  it('добавляет приписку «г.» к городу', () => {
    expect(formatCityDisplay('Самара')).toBe('г. Самара');
  });

  it('добавляет приписку к городу с дефисом', () => {
    expect(formatCityDisplay('Санкт-Петербург')).toBe('г. Санкт-Петербург');
  });

  it('не дублирует приписку если уже есть', () => {
    expect(formatCityDisplay('г. Москва')).toBe('г. Москва');
  });

  it('возвращает пустую строку для пустого значения', () => {
    expect(formatCityDisplay('')).toBe('');
  });
});
