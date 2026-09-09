// Тесты восстановления пароля (шаги 34.69–34.74).
//
// Здесь проверяется не «маршрут отвечает 200», а четыре обещания, каждое из которых
// при нарушении стоит учётной записи:
//
// 1. Заявка НЕ работает перечислителем аккаунтов: ответ на заведённую и незаведённую
//    почту совпадает дословно.
// 2. Ссылка одноразовая и срочная: использованная и истёкшая отклоняются.
// 3. Сброс гасит ВСЕ сессии — иначе тот, кто увёл доступ, останется внутри.
// 4. В базе лежит хеш, а не само значение из письма.
//
// Отдельно проверяется сама граница отправки: отправитель подменяется через свой
// токен внедрения, и письмо перехватывается. Если подмена перестанет работать,
// значит смена почтовой службы потребует правки бизнес-кода — а вся затея с
// интерфейсом ровно в том, чтобы не потребовала.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashSecretToken } from '../common/secret-token';
import { MAILER, type Mailer, type OutgoingEmail } from '../mail/mailer';
import type { PasswordResetTokensRepository } from '../repositories/crud.repository';
import { PASSWORD_RESET_TOKENS_REPOSITORY } from '../repositories/crud.repository';
import { createTestDatabase, type TestDatabase } from '../test/db-harness';
import {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  createTestHarness,
  type TestHarness,
} from '../test/harness';
import { RESET_LINK_INVALID } from './password-reset.service';

const HOUR_MS = 60 * 60 * 1000;

/** Новый пароль, который ставится сбросом. Заведомо не равен демонстрационному. */
const NEW_PASSWORD = 'новый-пароль-1';

/**
 * Отправитель-перехватчик: письмо остаётся здесь и наружу не уходит.
 *
 * Реализует тот же интерфейс, что и боевой отправитель, и подставляется по тому же
 * токену. Ничего, кроме `send`, у него нет — это и есть проверка, что бизнес-коду
 * от почты больше ничего и не нужно.
 */
class CapturingMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];

  async send(email: OutgoingEmail): Promise<void> {
    this.sent.push(email);
  }
}

const user = (id: number, email: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  status: 'active',
  name: `Пользователь ${id}`,
  email,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('Восстановление пароля', () => {
  let harness: TestHarness;
  let db: TestDatabase;
  const mailer = new CapturingMailer();

  beforeAll(async () => {
    // Предел частоты поднят намеренно: этот набор проверяет поведение
    // восстановления, а не ограничитель. Ограничитель проверяется ниже, своим
    // приложением и своим счётчиком.
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_PASSWORD_RESET', '1000');

    harness = await createTestHarness('password-reset', [{ token: MAILER, useValue: mailer }]);
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
    await db.close();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    // Запись пересобирает базу целиком: и сессии, и выданные ссылки уходят вместе
    // с ней, поэтому наборы не наследуют состояние друг друга.
    await harness.write('users', [user(1, 'athlete@test.local'), user(2, 'second@test.local')]);
    mailer.sent.length = 0;
  });

  const server = () => harness.app.getHttpServer();

  const forgot = (email: unknown) =>
    request(server()).post('/api/auth/forgot-password').send({ email });

  const reset = (token: string, password: string) =>
    request(server()).post('/api/auth/reset-password').send({ token, password });

  const login = (password: string) =>
    request(server()).post('/api/auth/login').send({ email: 'athlete@test.local', password });

  /** Значение ссылки из последнего письма — ровно то, что получил бы человек. */
  const tokenFromLetter = (): string => {
    const letter = mailer.sent.at(-1);

    expect(letter, 'письма не было').toBeDefined();

    const match = /token=([^\s]+)/.exec(letter?.text ?? '');

    expect(match, 'в письме нет ссылки со значением').not.toBeNull();

    return decodeURIComponent(match?.[1] ?? '');
  };

  /** Выдать ссылку обычным ходом и вернуть её значение. */
  const requestLink = async (email = 'athlete@test.local'): Promise<string> => {
    expect((await forgot(email)).status).toBe(200);

    return tokenFromLetter();
  };

  it('ответ на заведённую и незаведённую почту совпадает дословно', async () => {
    const known = await forgot('athlete@test.local');
    const unknown = await forgot('nobody@test.local');

    // Суть проверки — в совпадении. Разойдись ответы хоть кодом, хоть телом,
    // и маршрут превратится в перечислитель заведённых аккаунтов.
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    // Письмо при этом ушло только тому, кто существует.
    expect(mailer.sent.map((letter) => letter.to)).toEqual(['athlete@test.local']);
  });

  it('заблокированной учётке отвечают так же, но письма не шлют', async () => {
    await harness.write('users', [{ ...user(1, 'athlete@test.local'), status: 'banned' }]);

    const response = await forgot('athlete@test.local');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    // Иначе бан снимался бы письмом на ту же почту.
    expect(mailer.sent).toHaveLength(0);
  });

  it('отправитель подменяется через свой токен, письмо перехватывается целиком', async () => {
    await forgot('athlete@test.local');

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('athlete@test.local');
    expect(mailer.sent[0].subject).toContain('Восстановление пароля');
    expect(mailer.sent[0].text).toContain('/reset-password?token=');
  });

  it('в базе лежит хеш значения, а не само значение из письма', async () => {
    const token = await requestLink();

    const rows = await db.prisma.passwordResetToken.findMany();

    expect(rows).toHaveLength(1);
    // Само значение существует ровно один раз — в письме. В дампе базы его нет.
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toBe(hashSecretToken(token));

    // И поиск это подтверждает: по открытому значению не находится ничего.
    const tokens = harness.app.get<PasswordResetTokensRepository>(PASSWORD_RESET_TOKENS_REPOSITORY);
    const now = new Date().toISOString();

    expect(await tokens.findUsableByTokenHash(token, now)).toBeNull();
    expect(await tokens.findUsableByTokenHash(hashSecretToken(token), now)).not.toBeNull();
  });

  it('сброс меняет пароль: старый больше не пускает, новый пускает', async () => {
    const token = await requestLink();

    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);

    expect((await login(DEMO_PASSWORD)).status).toBe(401);
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });

  it('после сброса прежние сессии мертвы', async () => {
    const cookie = await harness.as(1);

    // До сброса сессия живая — иначе проверка ниже ничего не доказывала бы.
    expect((await request(server()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);

    const token = await requestLink();

    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);

    // Главное обещание шага: тот, кто увёл доступ, вылетает в тот же момент.
    expect((await request(server()).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('использованная ссылка отклоняется повторно', async () => {
    const token = await requestLink();

    expect((await reset(token, NEW_PASSWORD)).status).toBe(200);

    const second = await reset(token, 'другой-пароль-2');

    expect(second.status).toBe(400);
    expect(second.body.error).toBe(RESET_LINK_INVALID);
    // И второй пароль не встал: отказ настоящий, а не косметический.
    expect((await login('другой-пароль-2')).status).toBe(401);
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });

  it('истёкшая ссылка отклоняется', async () => {
    const token = 'значение-истёкшей-ссылки';

    // Строка заводится напрямую: выдать протухшую ссылку обычным ходом нельзя —
    // это отбивает ограничение базы `expires_at > created_at`. Поэтому она
    // заводится так, как выглядела бы выданная три часа назад.
    await db.prisma.passwordResetToken.create({
      data: {
        tokenHash: hashSecretToken(token),
        userId: 1,
        createdAt: new Date(Date.now() - 3 * HOUR_MS),
        expiresAt: new Date(Date.now() - 2 * HOUR_MS),
      },
    });

    const response = await reset(token, NEW_PASSWORD);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(RESET_LINK_INVALID);
    // Пароль остался прежним.
    expect((await login(DEMO_PASSWORD)).status).toBe(200);
  });

  it('несуществующая ссылка отклоняется тем же текстом, что истёкшая', async () => {
    const response = await reset('такой-ссылки-не-выдавали', NEW_PASSWORD);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(RESET_LINK_INVALID);
  });

  it('успешный сброс гасит и остальные выданные ссылки того же человека', async () => {
    const first = await requestLink();
    const second = await requestLink();

    expect(first).not.toBe(second);
    expect((await reset(second, NEW_PASSWORD)).status).toBe(200);

    // Второе письмо не должно остаться рабочим ключом от уже восстановленной учётки.
    const attempt = await reset(first, 'третий-пароль-3');

    expect(attempt.status).toBe(400);
    expect(attempt.body.error).toBe(RESET_LINK_INVALID);
  });

  it('уборка убирает протухшую ссылку и оставляет живую', async () => {
    const live = await requestLink();

    await db.prisma.passwordResetToken.create({
      data: {
        tokenHash: hashSecretToken('протухшая'),
        userId: 1,
        createdAt: new Date(Date.now() - 3 * HOUR_MS),
        expiresAt: new Date(Date.now() - 2 * HOUR_MS),
      },
    });

    const tokens = harness.app.get<PasswordResetTokensRepository>(PASSWORD_RESET_TOKENS_REPOSITORY);

    expect(await tokens.removeExpired(new Date().toISOString())).toBe(1);

    const rows = await db.prisma.passwordResetToken.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashSecretToken(live));
  });

  it('заявка без почты и сброс без пароля отвергаются разбором тела', async () => {
    expect((await forgot('не почта')).status).toBe(400);
    expect((await reset('что-нибудь', 'кор')).status).toBe(400);
  });
});

describe('Восстановление пароля под ограничением частоты', () => {
  let harness: TestHarness;
  const mailer = new CapturingMailer();

  beforeAll(async () => {
    // Предел занижен переменными окружения: набор обязан переполнить счётчик,
    // а не ждать боевых пяти обращений за десять минут. Читается он один раз,
    // когда собирается модуль ограничителя, — поэтому ставится ДО подъёма.
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_PASSWORD_RESET', '2');
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_PASSWORD_RESET_WINDOW_MS', '60000');

    harness = await createTestHarness('password-reset-rate', [{ token: MAILER, useValue: mailer }]);
    await harness.write('users', [user(1, 'athlete@test.local')]);
  }, 120_000);

  afterAll(async () => {
    await harness.close();
    vi.unstubAllEnvs();
  });

  it('превышение частоты заявок отвечает 429', async () => {
    const forgot = () =>
      request(harness.app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'athlete@test.local' });

    expect((await forgot()).status).toBe(200);
    expect((await forgot()).status).toBe(200);

    const blocked = await forgot();

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('у сброса свой счётчик: заявки его не съедают', async () => {
    // Иначе человек, трижды нажавший «отправить ещё раз», не смог бы
    // воспользоваться пришедшей ссылкой.
    const response = await request(harness.app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: 'такой-ссылки-не-выдавали', password: 'пароль-1' });

    expect(response.status).toBe(400);
  });
});
