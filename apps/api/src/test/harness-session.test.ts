// Самопроверка обвязки: `harness.as()` действительно пускает на закрытый маршрут.
//
// Проверяется не удобство метода, а его пригодность как инструмента. Дальше на нём
// поедут все наборы фазы 34, и если он выдаёт cookie, которую guard не принимает,
// сотня тестов покраснеет разом — с сообщением «требуется вход», по которому
// причину не найти. Поэтому инструмент доказывает себя отдельно и заранее.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from './harness';

const user = (id: number, role: string, email: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
  status: 'active',
  name: `Пользователь ${id}`,
  email,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('Обвязка тестов: вход от лица пользователя', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('harness-session');
  });

  beforeEach(async () => {
    await harness.write('users', [
      user(1, 'athlete', 'athlete@test.local'),
      user(2, 'club_owner', 'owner@test.local'),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('cookie от обвязки пускает на закрытый маршрут — и именно тем пользователем', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(2);
    expect(response.body.data.email).toBe('owner@test.local');
  });

  it('без cookie тот же маршрут отвечает 401', async () => {
    // Контрольная группа: без неё зелёный первый тест ничего не доказывал бы —
    // маршрут мог бы быть просто открыт, и cookie ни на что не влияла.
    const response = await request(harness.app.getHttpServer()).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('для незасеянного пользователя обвязка падает понятной ошибкой, а не молчит', async () => {
    // Молчаливый промах пришёл бы к автору теста как 401 «требуется вход» —
    // ошибка, которая уводит искать поломку в guard'е вместо забытого засева.
    await expect(harness.as(404)).rejects.toThrow(/пользователя 404/);
  });
});
