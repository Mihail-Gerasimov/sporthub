// Тесты новых маршрутов услуг и пользователей.
// Главный из них — про пароль: маршрут пользователей создаётся с нуля, пароли
// в хранилище лежат открытым текстом, и утечка здесь была бы дороже всего
// остального в фазе.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';

describe('Маршруты услуг и пользователей', () => {
  let app: INestApplication;
  let dataDirectory: string;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-catalog-http-'));
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;

    const write = async (name: string, data: unknown) =>
      writeFile(
        path.join(dataDirectory, `${name}.json`),
        `${JSON.stringify(data, null, 2)}\n`,
        'utf8',
      );

    await write('offerings', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'club',
        ownerId: 1,
        title: 'Клубная',
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'trainer',
        ownerId: 5,
        title: 'Тренерская',
      },
    ]);
    await write('users', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Иван',
        email: 'ivan@test.local',
        phone: '+7 (900) 000-00-00',
        password: 'очень-секретный-пароль',
        favoriteClubIds: [],
      },
    ]);
    for (const name of [
      'clubs',
      'trainers',
      'schedule',
      'bookings',
      'reviews',
      'notifications',
      'logs',
      'trainer-club-links',
      'provider-client-notes',
      'sports',
      'cities',
      'tags',
      'amenities',
      'specialties',
      'work-formats',
    ]) {
      await write(name, []);
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe('GET /offerings', () => {
    it('без фильтров отдаёт все услуги', async () => {
      const response = await request(app.getHttpServer()).get('/offerings');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('фильтрует по владельцу', async () => {
      const response = await request(app.getHttpServer()).get(
        '/offerings?ownerType=trainer&ownerId=5',
      );

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Тренерская');
    });

    it('неверный тип владельца отклоняется', async () => {
      const response = await request(app.getHttpServer()).get('/offerings?ownerType=xxx&ownerId=1');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Некорректные параметры запроса',
      });
    });

    it('нечисловой идентификатор владельца отклоняется', async () => {
      const response = await request(app.getHttpServer()).get(
        '/offerings?ownerType=club&ownerId=abc',
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /users', () => {
    it('отдаёт пользователей', async () => {
      const response = await request(app.getHttpServer()).get('/users');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].email).toBe('ivan@test.local');
    });

    it('⚠️ пароль не уходит наружу ни в каком виде', async () => {
      const response = await request(app.getHttpServer()).get('/users');

      expect(response.body.data[0]).not.toHaveProperty('password');
      // Дополнительная страховка: ищем значение пароля во всём теле ответа.
      expect(JSON.stringify(response.body)).not.toContain('очень-секретный-пароль');
    });
  });
});
