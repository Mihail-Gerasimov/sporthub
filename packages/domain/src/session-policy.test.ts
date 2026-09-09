// Проверка сроков жизни сессии.
//
// Проверяем не отдельные удачные случаи, а оба срока и их приоритет: истечение по
// предельному сроку, истечение по бездействию и отзыв, который сильнее обоих. Ошибка
// здесь не падает тестами приложения — она выглядит как «сессия почему-то живёт вечно»,
// и заметить её можно только такой проверкой.

import { USER_ROLES } from '@sporthub/types';
import { describe, expect, it } from 'vitest';

import {
  SESSION_POLICY,
  SESSION_TOUCH_INTERVAL_MS,
  type SessionExpiryCheck,
  isSessionExpired,
  sessionExpiryFor,
} from './session-policy';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const NOW = new Date('2026-09-09T12:00:00.000Z');

/** Живая сессия роли: вошли только что, обращались только что. */
function sessionFor(role: SessionExpiryCheck['role'], now: Date = NOW): SessionExpiryCheck {
  return {
    role,
    lastSeenAt: now.toISOString(),
    expiresAt: sessionExpiryFor(role, now).toISOString(),
  };
}

describe('Сроки жизни сессии', () => {
  describe('словарь политик', () => {
    it('покрывает каждую роль из USER_ROLES', () => {
      // Компилятор держит словарь полным через `Record<UserRole, ...>`, но эта проверка
      // ловит и второй способ его сломать — нулевой или отрицательный срок.
      for (const role of USER_ROLES) {
        expect(SESSION_POLICY[role]).toBeDefined();
        expect(SESSION_POLICY[role].idleMs).toBeGreaterThan(0);
        expect(SESSION_POLICY[role].absoluteMs).toBeGreaterThan(0);
      }

      expect(Object.keys(SESSION_POLICY).sort()).toEqual([...USER_ROLES].sort());
    });

    it('у админа срок бездействия строго короче, чем у обычных ролей', () => {
      for (const role of USER_ROLES) {
        if (role === 'admin') {
          continue;
        }
        expect(SESSION_POLICY.admin.idleMs).toBeLessThan(SESSION_POLICY[role].idleMs);
      }
    });

    it('держит решение заказчика: две недели предельный, сутки бездействия у админа', () => {
      expect(SESSION_POLICY.athlete.absoluteMs).toBe(14 * DAY_MS);
      expect(SESSION_POLICY.athlete.idleMs).toBe(14 * DAY_MS);
      expect(SESSION_POLICY.admin.absoluteMs).toBe(14 * DAY_MS);
      expect(SESSION_POLICY.admin.idleMs).toBe(DAY_MS);
    });

    it('окно продления много короче самого короткого срока бездействия', () => {
      // Иначе продление не успевало бы за сроком и сессия гасла бы у активного человека.
      const shortestIdle = Math.min(...USER_ROLES.map((role) => SESSION_POLICY[role].idleMs));
      expect(SESSION_TOUCH_INTERVAL_MS).toBe(5 * MINUTE_MS);
      expect(SESSION_TOUCH_INTERVAL_MS).toBeLessThan(shortestIdle);
    });
  });

  describe('предельный срок', () => {
    it('считается от момента выдачи по политике роли', () => {
      expect(sessionExpiryFor('athlete', NOW).toISOString()).toBe('2026-09-23T12:00:00.000Z');
      expect(sessionExpiryFor('admin', NOW).toISOString()).toBe('2026-09-23T12:00:00.000Z');
    });

    it('гасит сессию, даже если ею пользовались только что', () => {
      const session: SessionExpiryCheck = {
        role: 'athlete',
        // Вход был 15 суток назад, предельный срок — 14: активность его не сдвигает.
        expiresAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
        lastSeenAt: new Date(NOW.getTime() - MINUTE_MS).toISOString(),
      };

      expect(isSessionExpired(session, NOW)).toBe(true);
    });
  });

  describe('срок бездействия', () => {
    it('гасит сессию админа через сутки без обращений', () => {
      const session: SessionExpiryCheck = {
        ...sessionFor('admin'),
        lastSeenAt: new Date(NOW.getTime() - DAY_MS - MINUTE_MS).toISOString(),
      };

      expect(isSessionExpired(session, NOW)).toBe(true);
    });

    it('не гасит сессию админа, к которой обращались меньше суток назад', () => {
      const session: SessionExpiryCheck = {
        ...sessionFor('admin'),
        lastSeenAt: new Date(NOW.getTime() - DAY_MS + MINUTE_MS).toISOString(),
      };

      expect(isSessionExpired(session, NOW)).toBe(false);
    });

    it('те же сутки без обращений не трогают обычного пользователя', () => {
      // У обычных ролей отдельного порога бездействия нет — он равен предельному сроку.
      const session: SessionExpiryCheck = {
        ...sessionFor('athlete'),
        lastSeenAt: new Date(NOW.getTime() - DAY_MS - MINUTE_MS).toISOString(),
      };

      expect(isSessionExpired(session, NOW)).toBe(false);
    });
  });

  describe('отзыв', () => {
    it('гасит сессию независимо от обоих сроков', () => {
      const session: SessionExpiryCheck = {
        ...sessionFor('athlete'),
        revokedAt: new Date(NOW.getTime() - MINUTE_MS).toISOString(),
      };

      expect(isSessionExpired(session, NOW)).toBe(true);
    });
  });

  it('живая сессия каждой роли не считается истёкшей', () => {
    for (const role of USER_ROLES) {
      expect(isSessionExpired(sessionFor(role), NOW)).toBe(false);
    }
  });
});
