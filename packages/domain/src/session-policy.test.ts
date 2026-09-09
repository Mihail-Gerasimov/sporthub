// Проверка сроков жизни сессии.
//
// Проверяем не отдельные удачные случаи, а оба срока и их приоритет: истечение по
// предельному сроку, истечение по бездействию и отзыв, который сильнее обоих. Ошибка
// здесь не падает тестами приложения — она выглядит как «сессия почему-то живёт вечно»,
// и заметить её можно только такой проверкой.

import { describe, expect, it } from 'vitest';

import { ACCOUNT_KINDS } from './account-kind';
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

/** Живая сессия вида учётной записи: вошли только что, обращались только что. */
function sessionFor(
  accountKind: SessionExpiryCheck['accountKind'],
  now: Date = NOW,
): SessionExpiryCheck {
  return {
    accountKind,
    lastSeenAt: now.toISOString(),
    expiresAt: sessionExpiryFor(accountKind, now).toISOString(),
  };
}

describe('Сроки жизни сессии', () => {
  describe('словарь политик', () => {
    it('покрывает каждый вид учётной записи из ACCOUNT_KINDS', () => {
      // Компилятор держит словарь полным через `Record<AccountKind, ...>`, но эта
      // проверка ловит и второй способ его сломать — нулевой или отрицательный срок.
      for (const kind of ACCOUNT_KINDS) {
        expect(SESSION_POLICY[kind]).toBeDefined();
        expect(SESSION_POLICY[kind].idleMs).toBeGreaterThan(0);
        expect(SESSION_POLICY[kind].absoluteMs).toBeGreaterThan(0);
      }

      expect(Object.keys(SESSION_POLICY).sort()).toEqual([...ACCOUNT_KINDS].sort());
    });

    it('у админа срок бездействия строго короче, чем у человека', () => {
      // ⚠️ Ловушка 7.3 фазы 35: при уходе роли администратор мог тихо получить
      // умолчание — и его окно бездействия выросло бы с суток до двух недель.
      for (const kind of ACCOUNT_KINDS) {
        if (kind === 'admin') {
          continue;
        }
        expect(SESSION_POLICY.admin.idleMs).toBeLessThan(SESSION_POLICY[kind].idleMs);
      }
    });

    it('держит решение заказчика: две недели предельный, сутки бездействия у админа', () => {
      expect(SESSION_POLICY.person.absoluteMs).toBe(14 * DAY_MS);
      expect(SESSION_POLICY.person.idleMs).toBe(14 * DAY_MS);
      expect(SESSION_POLICY.admin.absoluteMs).toBe(14 * DAY_MS);
      expect(SESSION_POLICY.admin.idleMs).toBe(DAY_MS);
    });

    it('окно продления много короче самого короткого срока бездействия', () => {
      // Иначе продление не успевало бы за сроком и сессия гасла бы у активного человека.
      const shortestIdle = Math.min(...ACCOUNT_KINDS.map((kind) => SESSION_POLICY[kind].idleMs));
      expect(SESSION_TOUCH_INTERVAL_MS).toBe(5 * MINUTE_MS);
      expect(SESSION_TOUCH_INTERVAL_MS).toBeLessThan(shortestIdle);
    });
  });

  describe('предельный срок', () => {
    it('считается от момента выдачи по политике вида учётной записи', () => {
      expect(sessionExpiryFor('person', NOW).toISOString()).toBe('2026-09-23T12:00:00.000Z');
      expect(sessionExpiryFor('admin', NOW).toISOString()).toBe('2026-09-23T12:00:00.000Z');
    });

    it('гасит сессию, даже если ею пользовались только что', () => {
      const session: SessionExpiryCheck = {
        accountKind: 'person',
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

    it('те же сутки без обращений не трогают обычного человека', () => {
      // У человека отдельного порога бездействия нет — он равен предельному сроку.
      const session: SessionExpiryCheck = {
        ...sessionFor('person'),
        lastSeenAt: new Date(NOW.getTime() - DAY_MS - MINUTE_MS).toISOString(),
      };

      expect(isSessionExpired(session, NOW)).toBe(false);
    });
  });

  describe('отзыв', () => {
    it('гасит сессию независимо от обоих сроков', () => {
      const session: SessionExpiryCheck = {
        ...sessionFor('person'),
        revokedAt: new Date(NOW.getTime() - MINUTE_MS).toISOString(),
      };

      expect(isSessionExpired(session, NOW)).toBe(true);
    });
  });

  it('живая сессия каждого вида учётной записи не считается истёкшей', () => {
    for (const kind of ACCOUNT_KINDS) {
      expect(isSessionExpired(sessionFor(kind), NOW)).toBe(false);
    }
  });
});
