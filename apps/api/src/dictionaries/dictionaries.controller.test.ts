// Тесты контроллеров справочников через реальный HTTP-запрос к поднятому
// приложению. Это первая проверка полного каркаса: маршрут, внедрение
// зависимостей, интерцептор ответа и обработчик ошибок вместе.

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Контроллеры справочников', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('dict-http');

    // В каждом справочнике ровно одна запись: проверка ниже смотрит и на длину
    // выдачи, и на имя, поэтому лишняя строка сломала бы обе половины сразу.
    // Все справочники переносятся одним срезом: раздельная запись у базы вычистила
    // бы соседние таблицы — перенос кладёт срез целиком.
    await harness.writeMany({
      sports: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Плавание',
          slug: 'swim',
          description: 'Занятия в бассейне',
          icon: '🏊',
          imageUrl: '/images/sports/swim.jpg',
          isPopular: true,
        },
      ],
      // У города, в отличие от прочих справочников, есть центр карты — колонка
      // обязательная, поэтому координаты указаны явно.
      cities: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Самара',
          coordinates: { lat: 53.1959, lng: 50.1008 },
        },
      ],
      tags: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Парковка' }],
      amenities: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Душ' }],
      'work-formats': [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Онлайн' }],
      specialties: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Кроссфит' }],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  const routes = [
    ['/sports', 'Плавание'],
    ['/cities', 'Самара'],
    ['/tags', 'Парковка'],
    ['/amenities', 'Душ'],
    ['/work-formats', 'Онлайн'],
    ['/specialties', 'Кроссфит'],
  ] as const;

  for (const [route, expectedName] of routes) {
    it(`GET ${route} отдаёт справочник в общей форме ответа`, async () => {
      const response = await request(harness.app.getHttpServer()).get(`/api${route}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe(expectedName);
    });
  }

  it('несуществующий маршрут не притворяется успешным', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/no-such-dictionary');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
