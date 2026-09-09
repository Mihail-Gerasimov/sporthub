/**
 * Тесты доменной модели для admin-функционала (Step 17.1).
 * Проверяют: UserStatus тип, status? поле в User, администратор набора,
 * константы USER_STATUSES.
 *
 * Phase 34 Step 34.48: проверка константы `MVP_ADMIN_USER_ID` убрана вместе
 * с самой константой — фронт больше не знает наперёд, кто администратор.
 * Что администратор есть в наборе, проверяет блок ниже; что фронт не завёл
 * такие константы заново — сторож `test/security/client-identity.test.ts`.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { AccountKind, User, UserStatus } from '@sporthub/types';
import { USER_STATUSES } from '@sporthub/types';
import { fixtureUsers } from '@sporthub/fixtures';

describe('Admin domain model (Step 17.1)', () => {
  // --- Типы ---

  it('UserStatus определяет три статуса: active, banned, suspended', () => {
    expectTypeOf<UserStatus>().toEqualTypeOf<'active' | 'banned' | 'suspended'>();
  });

  it('User содержит опциональное поле status типа UserStatus', () => {
    expectTypeOf<User>().toMatchTypeOf<{ status?: UserStatus }>();

    // User без status — валиден (обратная совместимость с test fixtures)
    const userWithoutStatus: User = {
      id: 99,
      createdAt: '2026-01-01T00:00:00.000Z',
      name: 'Тест',
      email: 'test@test.local',
      phone: '+7 000 000 00 00',
      passwordHash: '123456',
      favoriteClubIds: [],
    };

    expect(userWithoutStatus.status).toBeUndefined();
  });

  it('вид учётной записи по-прежнему включает admin', () => {
    // ⚠️ Шаг 35.24: ролей нет. Различие администратора не выводится из владения,
    // и живёт оно теперь в виде учётной записи — проверяем именно его.
    expectTypeOf<'admin'>().toMatchTypeOf<AccountKind>();
  });

  // --- Константы ---

  it('USER_STATUSES содержит все три статуса', () => {
    expect(USER_STATUSES).toEqual(['active', 'banned', 'suspended']);
  });

  // --- Общий набор пользователей ---
  //
  // Раньше проверка ходила в файл `users.json` временной копии каталога данных.
  // Каталога у фронта больше нет: набор объявлен в `@sporthub/fixtures`, и он же
  // приезжает в базу при подготовке стенда.

  describe('admin-пользователь в общем наборе', () => {
    it('набор содержит администратора с id=3 и видом учётной записи admin', () => {
      const admin = fixtureUsers.find((user) => user.id === 3);

      expect(admin).toBeDefined();
      expect(admin!.accountKind).toBe('admin');
      expect(admin!.name).toBeTruthy();
      expect(admin!.email).toBeTruthy();
    });

    it('все пользователи набора имеют status: active', () => {
      expect(fixtureUsers.length).toBeGreaterThanOrEqual(3);

      for (const user of fixtureUsers) {
        expect(user.status).toBe('active');
      }
    });

    it('прочие люди набора — обычные люди, а не служебные записи', () => {
      // ⚠️ Шаг 35.24. Прежде здесь сверялись роли — теперь сверять нечего:
      // все, кроме администратора, заведены одинаково, а различает их только
      // владение лицами услуг.
      const athlete = fixtureUsers.find((user) => user.id === 1);
      const provider = fixtureUsers.find((user) => user.id === 2);

      expect(athlete).toBeDefined();
      expect(athlete!.accountKind).toBeUndefined();
      expect(athlete!.name).toBe('Алексей Смирнов');

      expect(provider).toBeDefined();
      expect(provider!.accountKind).toBeUndefined();
      expect(provider!.name).toBe('Марина Крылова');
    });
  });
});
