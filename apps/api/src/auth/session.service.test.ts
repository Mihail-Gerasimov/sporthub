// Тесты сессий: выдача, разбор личности, продление, отзыв, уборка.
//
// Проверяется не «работает ли метод», а обещания, на которых держится вход:
// в базу не попадает сам идентификатор, продление не пишет на каждый запрос,
// отозванная и просроченная сессии не пускают, бан действует немедленно.

import { createHash } from 'node:crypto';

import { SESSION_TOUCH_INTERVAL_MS } from '@sporthub/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SessionsRepository } from '../repositories/crud.repository';
import { SESSIONS_REPOSITORY } from '../repositories/crud.repository';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';
import { SessionService } from './session.service';

const user = (id: number, role: string, status = 'active') => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
  status,
  name: `Пользователь ${id}`,
  email: `u${id}@test.local`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('Сессии', () => {
  let harness: TestHarness;
  let sessions: SessionService;
  let repository: SessionsRepository;
  const now = new Date('2026-09-09T12:00:00.000Z');

  beforeAll(async () => {
    harness = await createTestHarness('session-service');
    sessions = harness.app.get(SessionService);
    repository = harness.app.get(SESSIONS_REPOSITORY);
  });

  beforeEach(async () => {
    await harness.write('users', [
      user(1, 'athlete'),
      user(2, 'admin'),
      user(3, 'athlete', 'banned'),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('в базу уходит хеш идентификатора, а не он сам', async () => {
    // Утёкший дамп базы не должен давать вход — тот же принцип, что у паролей.
    const { token, session } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });

    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('каждая выдача даёт новый идентификатор', async () => {
    const first = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });
    const second = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });

    expect(first.token).not.toBe(second.token);
  });

  it('разбор личности возвращает вошедшего', async () => {
    const { token } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });

    const context = await sessions.resolve(token, now);

    expect(context?.user.id).toBe(1);
    expect(context?.actor.id).toBe(1);
  });

  it('под имперсонизацией права по цели, а журнал по настоящему исполнителю', async () => {
    const { token } = await sessions.issue({
      user: { id: 2, role: 'admin' },
      now,
      impersonatedUserId: 1,
    });

    const context = await sessions.resolve(token, now);

    expect(context?.user.id).toBe(1);
    expect(context?.actor.id).toBe(2);
  });

  it('отозванная сессия не пускает', async () => {
    const { token, session } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });

    await sessions.revoke(session.id, now);

    expect(await sessions.resolve(token, now)).toBeNull();
  });

  it('просроченная по предельному сроку не пускает', async () => {
    const { token } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });
    const muchLater = new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000);

    expect(await sessions.resolve(token, muchLater)).toBeNull();
  });

  // ⚠️ Шаг 35.7. Раньше срок бездействия проверялся только словарём
  // (`session-policy.test.ts`), а его ПОДКЛЮЧЕНИЕ — ничем. Ровно тот вид дефекта,
  // который дал фазе 34 шесть непокрасневших диверсий: логика покрыта, а то,
  // что её зовут, — нет. Здесь проверяется поведение живой сессии.
  describe('срок бездействия применяется, а не только объявлен', () => {
    /** Чуть больше суток — за порогом админа, но далеко до предельного срока. */
    const afterDay = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    it('сессия администратора гаснет через сутки без действий', async () => {
      const { token } = await sessions.issue({ user: { id: 2, role: 'admin' }, now });

      expect(await sessions.resolve(token, afterDay)).toBeNull();
    });

    it('сессия обычного человека сутки бездействия переживает', async () => {
      // Контрольная группа: без неё тест «админа выбросило» зелен и тогда,
      // когда выбрасывает всех подряд.
      const { token } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });

      expect(await sessions.resolve(token, afterDay)).not.toBeNull();
    });
  });

  it('бан действует немедленно, а не после истечения сессии', async () => {
    // Сессия выдана до бана и по срокам ещё жива — но действовать ею уже нельзя.
    const { token } = await sessions.issue({ user: { id: 3, role: 'athlete' }, now });

    expect(await sessions.resolve(token, now)).toBeNull();
  });

  it('продление не пишет в базу чаще, чем раз в окно', async () => {
    // ⚠️ Без этого условия таблица сессий превратилась бы в самого горячего
    // писателя платформы: запись на КАЖДЫЙ запрос к любому закрытому маршруту.
    const { session } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });
    const soon = new Date(now.getTime() + SESSION_TOUCH_INTERVAL_MS - 1000);

    await sessions.touchIfDue(session, soon);

    const untouched = await repository.findLiveByTokenHash(session.tokenHash, soon.toISOString());

    expect(untouched?.lastSeenAt).toBe(session.lastSeenAt);
  });

  it('за пределами окна продление происходит', async () => {
    const { session } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });
    const later = new Date(now.getTime() + SESSION_TOUCH_INTERVAL_MS + 1000);

    await sessions.touchIfDue(session, later);

    const touched = await repository.findLiveByTokenHash(session.tokenHash, later.toISOString());

    expect(touched?.lastSeenAt).toBe(later.toISOString());
  });

  it('отзыв всех сессий кроме текущей гасит только чужие', async () => {
    const keep = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });
    const drop = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });

    const revoked = await sessions.revokeOthers(1, keep.session.id, now);

    expect(revoked).toBe(1);
    expect(await sessions.resolve(drop.token, now)).toBeNull();
    expect(await sessions.resolve(keep.token, now)).not.toBeNull();
  });

  it('повторный отзыв не переписывает метку первого', async () => {
    // Первый отзыв и есть настоящий — именно он интересен при разборе инцидента.
    const { session } = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });

    await sessions.revoke(session.id, now);
    const later = new Date(now.getTime() + 60_000);
    await sessions.revoke(session.id, later);

    // Обвязка тестов знает только коллекции из среза данных, а сессии в него
    // не входят — читаем строку напрямую, как это делают тесты репозиториев.
    const stored = await harness.app
      .get(PrismaTransactionRunner)
      .client.session.findUnique({ where: { id: session.id } });

    expect(stored?.revokedAt?.toISOString()).toBe(now.toISOString());
  });

  it('уборка удаляет просроченные и не трогает живые', async () => {
    const alive = await sessions.issue({ user: { id: 1, role: 'athlete' }, now });
    const long = new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000);

    const removed = await sessions.removeExpired(long);

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await sessions.resolve(alive.token, now)).toBeNull();
  });
});
