// Тесты входа и регистрации. Проверяется и то, что ни пароль, ни его хеш
// не уходят наружу, и то, что вход НЕ проверяет пароль — это поведение
// перенесено сознательно. Phase 33 Step 33.9: регистрация обязана записывать
// argon2id-хеш, а не сам пароль.

import { verify } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

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

describe('Маршруты входа и регистрации', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('auth-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      user(1, 'athlete', 'athlete@test.local'),
      user(2, 'club_owner', 'owner@test.local'),
      user(3, 'admin', 'admin@test.local'),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('атлет входит по почте, пароль наружу не уходит', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete' });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(1);
    expect(response.body.data.password).toBeUndefined();
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it('вход проходит и с неверным паролем — проверки пароля нет', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: 'что угодно' });

    expect(response.status).toBe(200);
  });

  it('неизвестная почта — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', accountType: 'athlete' });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/не найден/i);
  });

  it('несовпадение типа кабинета — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@test.local', accountType: 'athlete' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/тип кабинета/i);
  });

  it('администратор через общий вход не пускается — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', accountType: 'athlete' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/service-portal|администрат/i);
  });

  it('регистрация атлета создаёт пользователя со следующим номером', async () => {
    const response = await request(harness.app.getHttpServer()).post('/api/auth/register').send({
      name: 'Новый',
      email: 'new@test.local',
      password: 'secret1',
      accountType: 'athlete',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(4);

    const stored =
      await harness.read<{ id: number; role: string; password?: string; passwordHash: string }[]>(
        'users',
      );
    expect(stored).toHaveLength(4);
    expect(stored[3].role).toBe('athlete');
    // Открытого пароля в записи нет вовсе, а хеш проверяется исходным паролем.
    expect(stored[3].password).toBeUndefined();
    expect(stored[3].passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verify(stored[3].passwordHash, 'secret1')).toBe(true);
  });

  it('регистрация провайдера создаёт владельца клуба', async () => {
    const response = await request(harness.app.getHttpServer()).post('/api/auth/register').send({
      name: 'Провайдер',
      email: 'provider@test.local',
      password: 'secret1',
      accountType: 'provider',
    });

    expect(response.status).toBe(201);

    const stored = await harness.read<{ role: string }[]>('users');
    expect(stored.at(-1)?.role).toBe('club_owner');
  });

  it('занятая почта — 409', async () => {
    const response = await request(harness.app.getHttpServer()).post('/api/auth/register').send({
      name: 'Дубль',
      email: 'athlete@test.local',
      password: 'secret1',
      accountType: 'athlete',
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/зарегистрирован/i);
  });

  it('короткое имя — 400', async () => {
    const response = await request(harness.app.getHttpServer()).post('/api/auth/register').send({
      name: 'А',
      email: 'short@test.local',
      password: 'secret1',
      accountType: 'athlete',
    });

    expect(response.status).toBe(400);
  });
});
