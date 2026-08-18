/**
 * Тесты API route GET /api/cities — публичный список городов.
 * Phase 23 — Step 23.4.
 */
import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/cities/route';

describe('GET /api/cities', () => {
  it('возвращает массив городов с корректной структурой', async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);

    // Каждый город — объект с id, name, coordinates, createdAt
    for (const city of json.data) {
      expect(city).toHaveProperty('id');
      expect(city).toHaveProperty('name');
      expect(city).toHaveProperty('coordinates');
      expect(city).toHaveProperty('createdAt');
      expect(typeof city.name).toBe('string');
      expect(typeof city.coordinates.lat).toBe('number');
      expect(typeof city.coordinates.lng).toBe('number');
    }
  });

  it('содержит Самару в seed-данных', async () => {
    const res = await GET();
    const json = await res.json();

    const samara = json.data.find((c: { name: string }) => c.name === 'Самара');
    expect(samara).toBeDefined();
    expect(samara.coordinates.lat).toBeCloseTo(53.195878, 2);
    expect(samara.coordinates.lng).toBeCloseTo(50.100202, 2);
  });

  it('содержит все 6 seed-городов', async () => {
    const res = await GET();
    const json = await res.json();

    const names = json.data.map((c: { name: string }) => c.name);
    expect(names).toContain('Самара');
    expect(names).toContain('Москва');
    expect(names).toContain('Санкт-Петербург');
    expect(names).toContain('Казань');
    expect(names).toContain('Екатеринбург');
    expect(names).toContain('Тольятти');
  });
});
