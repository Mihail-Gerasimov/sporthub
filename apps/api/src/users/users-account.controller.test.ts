// Тесты учётных данных.
//
// Три вещи разом. Первая — прежняя: ни пароль, ни его хеш не должны появляться
// в ответе ни при каких обстоятельствах, а обязательные типы уведомлений нельзя
// выключить. Вторая — новая (34.26): владелец берётся из сессии, а не из тела,
// поэтому чужую учётку и чужие настройки не достать ни подстановкой номера,
// ни просто адресом. Третья: под имперсонизацией учётные данные не меняются —
// раньше этот запрет жил только в вёрстке кабинета, то есть не жил вовсе.
//
// Проверок «несуществующий пользователь — 404» здесь больше нет намеренно:
// цель правки — всегда сам вошедший, а он существует по определению.

import { verify } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { SessionService } from '../auth/session.service';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  createTestHarness,
  type TestHarness,
} from '../test/harness';

describe('Маршруты учётных данных', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('users-account-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Алексей',
        email: 'a@test.local',
        phone: '+7 (900) 000-00-01',
        passwordHash: DEMO_PASSWORD_HASH,
        favoriteClubIds: [],
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'club_owner',
        name: 'Марина',
        email: 'm@test.local',
        phone: '+7 (900) 000-00-02',
        passwordHash: DEMO_PASSWORD_HASH,
        favoriteClubIds: [],
      },
      {
        id: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'admin',
        name: 'Админ',
        email: 'admin@test.local',
        phone: '+7 (900) 000-00-03',
        passwordHash: DEMO_PASSWORD_HASH,
        favoriteClubIds: [],
      },
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  /**
   * Cookie сессии, открытой под имперсонизацией.
   *
   * Обвязка такого не умеет и уметь не должна: имперсонизация — редкий случай,
   * а `harness.as` обязан оставаться коротким. Сессия выдаётся тем же сервисом,
   * что и на настоящем входе, — иначе проверялась бы не та сессия, что бывает
   * в бою.
   */
  const impersonationCookie = async (adminId: number, targetId: number): Promise<string> => {
    const users = harness.app.get<UsersRepository>(USERS_REPOSITORY);
    const admin = await users.findById(adminId);

    if (admin === null) {
      throw new Error(`Администратора ${adminId} нет в базе — засей его до вызова`);
    }

    const { token } = await harness.app.get(SessionService).issue({
      user: admin,
      now: new Date(),
      impersonatedUserId: targetId,
    });

    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
  };

  it('меняет телефон и не возвращает пароль', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await harness.as(1))
      .send({ phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBe('+7 (900) 111-22-33');
    expect(response.body.data.password).toBeUndefined();
    expect(response.body.data.passwordHash).toBeUndefined();

    const stored = await harness.read<{ id: number; phone: string }[]>('users');
    expect(stored[0].phone).toBe('+7 (900) 111-22-33');
  });

  it('гость чужую учётку не правит — 401', async () => {
    // Контрольная группа: без неё зелёные проверки ниже не доказывали бы, что
    // маршрут вообще спрашивает, кто пришёл.
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .send({ phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(401);

    const stored = await harness.read<{ id: number; phone: string }[]>('users');
    expect(stored[0].phone).toBe('+7 (900) 000-00-01');
  });

  it('меняет пароль при верном текущем', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await harness.as(1))
      .send({ password: 'newpass1', currentPassword: DEMO_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.passwordHash).toBeUndefined();

    // Записан новый хеш, а не сам пароль.
    const stored = await harness.read<{ passwordHash: string }[]>('users');
    expect(stored[0].passwordHash).not.toBe(DEMO_PASSWORD_HASH);
    expect(await verify(stored[0].passwordHash, 'newpass1')).toBe(true);
  });

  it('неверный текущий пароль — 401 и данные не меняются', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await harness.as(1))
      .send({ password: 'newpass1', currentPassword: 'wrong' });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/Неверный текущий пароль/);

    const stored = await harness.read<{ passwordHash: string }[]>('users');
    expect(stored[0].passwordHash).toBe(DEMO_PASSWORD_HASH);
  });

  it('смена пароля без текущего — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await harness.as(1))
      .send({ password: 'newpass1' });

    expect(response.status).toBe(400);
  });

  it('пустая правка — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await harness.as(1))
      .send({});

    expect(response.status).toBe(400);
  });

  it('некорректный телефон — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await harness.as(1))
      .send({ phone: '89001112233' });

    expect(response.status).toBe(400);
  });

  it('правка чужой учётной записи — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/2')
      .set('Cookie', await harness.as(1))
      .send({ phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Изменять можно только свои данные');

    const stored = await harness.read<{ id: number; phone: string }[]>('users');
    expect(stored[1].phone).toBe('+7 (900) 000-00-02');
  });

  it('номер в теле не делает вызывающего владельцем чужой учётки', async () => {
    // Ровно так дыра и работала: `userId` из тела сравнивался с номером в адресе,
    // и совпадали они всегда — их присылал один и тот же человек.
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/2')
      .set('Cookie', await harness.as(1))
      .send({ userId: 2, phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(403);

    const stored = await harness.read<{ id: number; phone: string }[]>('users');
    expect(stored[1].phone).toBe('+7 (900) 000-00-02');
  });

  it('под имперсонизацией телефон не меняется — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await impersonationCookie(3, 1))
      .send({ phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Под имперсонизацией нельзя менять учётные данные');

    const stored = await harness.read<{ id: number; phone: string }[]>('users');
    expect(stored[0].phone).toBe('+7 (900) 000-00-01');
  });

  it('под имперсонизацией пароль не меняется — 403, хеш прежний', async () => {
    // Самое опасное из запрещённого: смена пароля из-под имперсонизации отняла бы
    // у человека доступ, а в журнале выглядела бы как его собственное действие.
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1')
      .set('Cookie', await impersonationCookie(3, 1))
      .send({ password: 'newpass1', currentPassword: DEMO_PASSWORD });

    expect(response.status).toBe(403);

    const stored = await harness.read<{ passwordHash: string }[]>('users');
    expect(stored[0].passwordHash).toBe(DEMO_PASSWORD_HASH);
  });

  it('настройки уведомлений читаются и пишутся', async () => {
    const cookie = await harness.as(1);
    const patch = await request(harness.app.getHttpServer())
      .patch('/api/users/1/notification-preferences')
      .set('Cookie', cookie)
      .send({ preferences: { booking_rejected: false } });

    expect(patch.status).toBe(200);
    expect(patch.body.data.notificationPreferences.booking_rejected).toBe(false);

    const read = await request(harness.app.getHttpServer())
      .get('/api/users/1/notification-preferences')
      .set('Cookie', cookie);

    expect(read.status).toBe(200);
    expect(read.body.data.notificationPreferences.booking_rejected).toBe(false);
  });

  it('обязательные типы молча отбрасываются', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/1/notification-preferences')
      .set('Cookie', await harness.as(1))
      .send({
        preferences: {
          booking_confirmed: false,
          quarantine_start: false,
          booking_cancelled_by_provider: false,
          booking_rejected: false,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.notificationPreferences).toEqual({ booking_rejected: false });
  });

  it('чужие настройки править нельзя — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/users/2/notification-preferences')
      .set('Cookie', await harness.as(1))
      .send({ preferences: { booking_rejected: false } });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для редактирования чужих настроек');
  });

  it('чужие настройки читать нельзя — 403', async () => {
    // Этот маршрут не проверял ничего вовсе: по номеру в адресе он отдавал
    // настройки любого пользователя.
    const response = await request(harness.app.getHttpServer())
      .get('/api/users/2/notification-preferences')
      .set('Cookie', await harness.as(1));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для чтения чужих настроек');
  });

  it('гость настройки не читает — 401', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/users/1/notification-preferences',
    );

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('нечисловой идентификатор в настройках отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/users/abc/notification-preferences')
      .set('Cookie', await harness.as(1));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный id');
  });
});
