// Тесты контроллеров справочников через реальный HTTP-запрос к поднятому
// приложению. Это первая проверка полного каркаса: маршрут, внедрение
// зависимостей, интерцептор ответа и обработчик ошибок вместе.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';

describe('Контроллеры справочников', () => {
  let app: INestApplication;
  let dataDirectory: string;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-dict-http-'));
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;

    const fixtures: Record<string, unknown[]> = {
      sports: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Плавание', slug: 'swim' }],
      cities: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Самара' }],
      tags: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Парковка' }],
      amenities: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Душ' }],
      'work-formats': [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Онлайн' }],
      specialties: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Кроссфит' }],
    };
    for (const [name, data] of Object.entries(fixtures)) {
      await writeFile(path.join(dataDirectory, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    }
    for (const name of [
      'clubs', 'trainers', 'offerings', 'schedule', 'bookings', 'reviews',
      'notifications', 'logs', 'users', 'trainer-club-links', 'provider-client-notes',
    ]) {
      await writeFile(path.join(dataDirectory, `${name}.json`), '[]\n', 'utf8');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await rm(dataDirectory, { force: true, recursive: true });
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
      const response = await request(app.getHttpServer()).get(route);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe(expectedName);
    });
  }

  it('несуществующий маршрут не притворяется успешным', async () => {
    const response = await request(app.getHttpServer()).get('/no-such-dictionary');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
