// Тесты входа, выхода, «кто я» и регистрации.
//
// Фаза 34 меняет главное: вход СВЕРЯЕТ пароль и выдаёт сессию. Раньше он пускал
// по одной лишь почте, и это было закреплено тестом — теперь закрепляется обратное.
//
// Отдельно проверяется, что вход не работает перечислителем аккаунтов: неизвестная
// почта, неверный пароль и заблокированная учётка обязаны отвечать ОДИНАКОВО.
// Разные ответы позволяли бы собрать список заведённых почт, не зная ни одного пароля.

import { verify } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  createTestHarness,
  type TestHarness,
} from '../test/harness';

/** Достать cookie сессии из ответа. */
const sessionCookie = (response: request.Response): string | undefined =>
  (response.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) =>
    value.startsWith('sh-session='),
  );

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

  it('атлет входит с верным паролем, пароль наружу не уходит', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: DEMO_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(1);
    expect(response.body.data.password).toBeUndefined();
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it('вход выдаёт cookie сессии — недоступную скрипту и не пускающую на чужой сайт', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: DEMO_PASSWORD });

    const cookie = sessionCookie(response);

    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // В самой cookie лежит непредсказуемое значение, а не номер пользователя:
    // до фазы 34 там было голое число, и смена цифры меняла того, кем ты вошёл.
    expect(cookie).not.toMatch(/sh-session=1[;$]/);
  });

  it('неверный пароль не пускает', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: 'не тот' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Неверная почта или пароль');
    expect(sessionCookie(response)).toBeUndefined();
  });

  it('неизвестная почта отвечает ДОСЛОВНО так же, как неверный пароль', async () => {
    // Суть проверки — в совпадении ответов. Разойдись они хоть кодом, хоть текстом,
    // и вход превратится в перечислитель заведённых почт.
    const wrongPassword = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: 'не тот' });

    const unknownEmail = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', accountType: 'athlete', password: DEMO_PASSWORD });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.error).toBe(wrongPassword.body.error);
  });

  it('заблокированный пользователь отвечает так же, как неизвестная почта', async () => {
    await harness.write('users', [
      { ...user(1, 'athlete', 'athlete@test.local'), status: 'banned' },
    ]);

    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: DEMO_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Неверная почта или пароль');
  });

  it('без пароля вход не принимается вовсе', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete' });

    expect(response.status).toBe(400);
  });

  it('несовпадение типа кабинета — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'owner@test.local', accountType: 'athlete', password: DEMO_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/тип кабинета/i);
  });

  it('администратор через общий вход не пускается — 403', async () => {
    // Роль администратора не совпадает ни с одним типом кабинета, поэтому сначала
    // отвечает проверка типа; сам факт «это админ» наружу не сообщается.
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', accountType: 'provider', password: DEMO_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/service-portal|администрат/i);
  });

  it('выход отзывает сессию на сервере, а не только убирает cookie', async () => {
    // Очистки cookie мало: украденный идентификатор продолжал бы работать.
    const server = harness.app.getHttpServer();
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: DEMO_PASSWORD });
    const cookie = sessionCookie(login) as string;

    const logout = await request(server).post('/api/auth/logout').set('Cookie', cookie);

    expect(logout.status).toBe(200);

    // Тот же идентификатор больше не работает — именно это и значит «отозвана».
    const after = await request(server).get('/api/auth/me').set('Cookie', cookie);

    expect(after.status).toBe(401);
  });

  it('выход без сессии проходит молча', async () => {
    // Сообщать «такой сессии нет» некому и незачем: результат тот же самый.
    const response = await request(harness.app.getHttpServer()).post('/api/auth/logout');

    expect(response.status).toBe(200);
  });

  it('«кто я» отдаёт вошедшего и не отдаёт хеш пароля', async () => {
    const server = harness.app.getHttpServer();
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'owner@test.local', accountType: 'provider', password: DEMO_PASSWORD });

    const me = await request(server)
      .get('/api/auth/me')
      .set('Cookie', sessionCookie(login) as string);

    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(2);
    expect(me.body.data.passwordHash).toBeUndefined();
  });

  it('«кто я» без сессии — 401', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/auth/me');

    expect(response.status).toBe(401);
  });

  it('подделанный идентификатор сессии не пускает', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'sh-session=forged-value-that-was-never-issued');

    expect(response.status).toBe(401);
  });

  it('повторный вход выдаёт НОВЫЙ идентификатор', async () => {
    // Без выдачи нового значения остаётся фиксация сессии: подсунул жертве свой
    // идентификатор до входа — после входа он стал бы валидным для её учётной записи.
    const server = harness.app.getHttpServer();
    const first = await request(server)
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: DEMO_PASSWORD });
    const second = await request(server)
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: DEMO_PASSWORD });

    expect(sessionCookie(first)).not.toBe(sessionCookie(second));
  });

  it('регистрация сразу открывает сессию', async () => {
    const response = await request(harness.app.getHttpServer()).post('/api/auth/register').send({
      name: 'Сразу внутри',
      email: 'fresh@test.local',
      password: 'secret1',
      accountType: 'athlete',
    });

    expect(response.status).toBe(201);
    expect(sessionCookie(response)).toBeDefined();
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

describe('Сессии при смене пароля', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('auth-password-sessions');
  });

  beforeEach(async () => {
    await harness.write('users', [user(1, 'athlete', 'athlete@test.local')]);
  });

  afterAll(async () => {
    await harness.close();
  });

  const login = async (): Promise<string> => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'athlete@test.local', accountType: 'athlete', password: DEMO_PASSWORD });

    return sessionCookie(response) as string;
  };

  it('смена пароля гасит остальные сессии, но не текущую', async () => {
    // Ради этого пароль и меняют: сессия того, кто пароль подсмотрел, обязана
    // умереть в тот же момент. А сам меняющий вылетать не должен.
    const server = harness.app.getHttpServer();
    const other = await login();
    const current = await login();

    const changed = await request(server)
      .patch('/api/users/1')
      .set('Cookie', current)
      .send({ userId: 1, password: 'новый-пароль', currentPassword: DEMO_PASSWORD });

    expect(changed.status).toBe(200);

    expect((await request(server).get('/api/auth/me').set('Cookie', other)).status).toBe(401);
    expect((await request(server).get('/api/auth/me').set('Cookie', current)).status).toBe(200);
  });

  it('смена пароля без сессии невозможна вовсе', async () => {
    // Сценарий «сменить пароль из-под чужой сессии» после фазы 34 недостижим:
    // маршрут закрыт, и анонимный вызов не доходит до смены. Админская смена
    // чужого пароля живёт на своём маршруте — `POST /api/admin/users/:id/password`.
    const server = harness.app.getHttpServer();
    const owner = await login();

    const response = await request(server)
      .patch('/api/users/1')
      .send({ password: 'новый-пароль', currentPassword: DEMO_PASSWORD });

    expect(response.status).toBe(401);
    // Сессия владельца жива: пароль не менялся, гасить было нечего.
    expect((await request(server).get('/api/auth/me').set('Cookie', owner)).status).toBe(200);
  });
});
