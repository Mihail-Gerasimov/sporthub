/**
 * Тесты доменной модели для admin-функционала (Step 17.1).
 * Проверяют: UserStatus тип, status? поле в User, admin seed-пользователь,
 * USER_STATUSES константы, MVP_ADMIN_USER_ID.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';

import type { User, UserRole, UserStatus } from '@/types';
import { USER_STATUSES } from '@/lib/constants';
import { MVP_ADMIN_USER_ID } from '@/stores/useAuthStore';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';

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
      password: '123456',
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

  // --- Seed-данные ---

  describe('seed admin-пользователь в users.json', () => {
    let dataDirectory: string;

    beforeEach(async () => {
      dataDirectory = await createIsolatedDataDirectory();
      process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    });

    afterEach(async () => {
      delete process.env.SPORT_HUB_DATA_DIRECTORY;
      await removeIsolatedDataDirectory(dataDirectory);
    });

    it('users.json содержит admin-пользователя с id=3 и role=admin', async () => {
      const raw = await readFile(path.join(dataDirectory, 'users.json'), 'utf8');
      const users: User[] = JSON.parse(raw);

      const admin = users.find((u) => u.id === 3);

      expect(admin).toBeDefined();
      expect(admin!.role).toBe('admin');
      expect(admin!.name).toBeTruthy();
      expect(admin!.email).toBeTruthy();
    });

    it('все пользователи в users.json имеют status: active', async () => {
      const raw = await readFile(path.join(dataDirectory, 'users.json'), 'utf8');
      const users: User[] = JSON.parse(raw);

      expect(users.length).toBeGreaterThanOrEqual(3);

      for (const user of users) {
        expect(user.status).toBe('active');
      }
    });

    it('существующие пользователи (athlete id=1, provider id=2) не затронуты', async () => {
      const raw = await readFile(path.join(dataDirectory, 'users.json'), 'utf8');
      const users: User[] = JSON.parse(raw);

      const athlete = users.find((u) => u.id === 1);
      const provider = users.find((u) => u.id === 2);

      expect(athlete).toBeDefined();
      expect(athlete!.role).toBe('athlete');
      expect(athlete!.name).toBe('Алексей Смирнов');

      expect(provider).toBeDefined();
      expect(provider!.role).toBe('club_owner');
      expect(provider!.name).toBe('Марина Крылова');
    });
  });
});
