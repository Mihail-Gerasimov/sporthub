/**
 * Тесты доменной модели для admin-функционала (Step 17.1).
 * Проверяют: UserStatus тип, status? поле в User, admin seed-пользователь,
 * USER_STATUSES константы, MVP_ADMIN_USER_ID.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { User, UserRole, UserStatus } from '@sporthub/types';
import { USER_STATUSES } from '@sporthub/types';
import { fixtureUsers } from '@sporthub/fixtures';
import { MVP_ADMIN_USER_ID } from '@/stores/useAuthStore';

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
      role: 'athlete',
      name: 'Тест',
      email: 'test@test.local',
      phone: '+7 000 000 00 00',
      passwordHash: '123456',
      favoriteClubIds: [],
    };

    expect(userWithoutStatus.status).toBeUndefined();
  });

  it('UserRole по-прежнему включает admin', () => {
    expectTypeOf<'admin'>().toMatchTypeOf<UserRole>();
  });

  // --- Константы ---

  it('USER_STATUSES содержит все три статуса', () => {
    expect(USER_STATUSES).toEqual(['active', 'banned', 'suspended']);
  });

  it('MVP_ADMIN_USER_ID равен 3', () => {
    expect(MVP_ADMIN_USER_ID).toBe(3);
  });

  // --- Общий набор пользователей ---
  //
  // Раньше проверка ходила в файл `users.json` временной копии каталога данных.
  // Каталога у фронта больше нет: набор объявлен в `@sporthub/fixtures`, и он же
  // приезжает в базу при подготовке стенда.

  describe('admin-пользователь в общем наборе', () => {
    it('набор содержит admin-пользователя с id=3 и role=admin', () => {
      const admin = fixtureUsers.find((user) => user.id === 3);

      expect(admin).toBeDefined();
      expect(admin!.role).toBe('admin');
      expect(admin!.name).toBeTruthy();
      expect(admin!.email).toBeTruthy();
    });

    it('все пользователи набора имеют status: active', () => {
      expect(fixtureUsers.length).toBeGreaterThanOrEqual(3);

      for (const user of fixtureUsers) {
        expect(user.status).toBe('active');
      }
    });

    it('существующие пользователи (athlete id=1, provider id=2) не затронуты', () => {
      const athlete = fixtureUsers.find((user) => user.id === 1);
      const provider = fixtureUsers.find((user) => user.id === 2);

      expect(athlete).toBeDefined();
      expect(athlete!.role).toBe('athlete');
      expect(athlete!.name).toBe('Алексей Смирнов');

      expect(provider).toBeDefined();
      expect(provider!.role).toBe('club_owner');
      expect(provider!.name).toBe('Марина Крылова');
    });
  });
});
