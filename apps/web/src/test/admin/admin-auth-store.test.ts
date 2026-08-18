/**
 * Тесты admin-расширения auth store (Step 17.2).
 * Покрывают: adminLogin, startImpersonation, stopImpersonation,
 * logout при impersonation, persistence новых полей, userRoleToAccountType.
 */
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUTH_STORAGE_KEY,
  AUTH_STORE_DEFAULT_STATE,
  MVP_ADMIN_USER_ID,
  MVP_ATHLETE_USER_ID,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
  userRoleToAccountType,
  type AuthSessionUser,
} from '@/stores/useAuthStore';

const adminUser: AuthSessionUser = {
  id: MVP_ADMIN_USER_ID,
  name: 'Администратор SportHub',
  email: 'admin@sporthub.local',
};

const athleteUser: AuthSessionUser = {
  id: MVP_ATHLETE_USER_ID,
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 (927) 000-10-10',
};

const providerUser: AuthSessionUser = {
  id: MVP_PROVIDER_USER_ID,
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 (927) 000-20-20',
};

describe('Admin auth store (Step 17.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  // --- adminLogin ---

  describe('adminLogin', () => {
    it('устанавливает admin-сессию с isAdmin=true и accountType=null', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(adminUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(true);
      expect(state.accountType).toBeNull();
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });
  });

  // --- startImpersonation ---

  describe('startImpersonation', () => {
    it('переключает user и accountType на целевого пользователя', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(athleteUser);
      expect(state.accountType).toBe('athlete');
      expect(state.isAdmin).toBe(true);
      expect(state.isImpersonating).toBe(true);
      expect(state.adminOriginalUser).toEqual(adminUser);
    });

    it('работает для provider-пользователя', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(providerUser, 'provider');
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(providerUser);
      expect(state.accountType).toBe('provider');
      expect(state.isImpersonating).toBe(true);
      expect(state.adminOriginalUser).toEqual(adminUser);
    });

    it('не работает если isAdmin !== true', () => {
      // Обычный пользователь — не admin
      act(() => {
        useAuthStore.getState().login({
          accountType: 'athlete',
          user: athleteUser,
        });
      });

      act(() => {
        useAuthStore.getState().startImpersonation(providerUser, 'provider');
      });

      const state = useAuthStore.getState();

      // Состояние не изменилось — impersonation не прошёл
      expect(state.user).toEqual(athleteUser);
      expect(state.accountType).toBe('athlete');
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });
  });

  // --- stopImpersonation ---

  describe('stopImpersonation', () => {
    it('восстанавливает admin-сессию из adminOriginalUser', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      act(() => {
        useAuthStore.getState().stopImpersonation();
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(adminUser);
      expect(state.accountType).toBeNull();
      expect(state.isAdmin).toBe(true);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
      expect(state.isAuthenticated).toBe(true);
    });
  });

  // --- logout при impersonation ---

  describe('logout', () => {
    it('полностью очищает все поля включая admin/impersonation', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      act(() => {
        useAuthStore.getState().logout();
      });

      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.accountType).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });
  });

  // --- persistence ---

  describe('persistence', () => {
    it('новые admin-поля сохраняются в localStorage и восстанавливаются', async () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      // Сохраняем текущий localStorage
      const persistedValue = localStorage.getItem(AUTH_STORAGE_KEY);

      expect(persistedValue).toBeTruthy();

      // Проверяем что JSON содержит admin-поля
      const parsed = JSON.parse(persistedValue!);

      expect(parsed.state.isAdmin).toBe(true);
      expect(parsed.state.isImpersonating).toBe(true);
      expect(parsed.state.adminOriginalUser).toEqual(adminUser);

      // Сброс и rehydration
      act(() => {
        useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
      });

      localStorage.setItem(AUTH_STORAGE_KEY, persistedValue!);

      await act(async () => {
        await useAuthStore.persist.rehydrate();
      });

      const state = useAuthStore.getState();

      expect(state.isAdmin).toBe(true);
      expect(state.isImpersonating).toBe(true);
      expect(state.adminOriginalUser).toEqual(adminUser);
      expect(state.user).toEqual(athleteUser);
      expect(state.accountType).toBe('athlete');
    });
  });

  // --- userRoleToAccountType ---

  describe('userRoleToAccountType', () => {
    it('маппит athlete → athlete', () => {
      expect(userRoleToAccountType('athlete')).toBe('athlete');
    });

    it('маппит club_owner → provider', () => {
      expect(userRoleToAccountType('club_owner')).toBe('provider');
    });

    it('маппит trainer → provider', () => {
      expect(userRoleToAccountType('trainer')).toBe('provider');
    });

    it('маппит admin → null', () => {
      expect(userRoleToAccountType('admin')).toBeNull();
    });
  });

  // --- regression: обычный login/register ---

  describe('regression: обычный auth flow', () => {
    it('login по-прежнему работает и не затрагивает admin-поля', () => {
      act(() => {
        useAuthStore.getState().login({
          accountType: 'athlete',
          user: athleteUser,
        });
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(athleteUser);
      expect(state.accountType).toBe('athlete');
      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });

    it('register по-прежнему работает и не затрагивает admin-поля', () => {
      act(() => {
        useAuthStore.getState().register({
          accountType: 'provider',
          user: providerUser,
        });
      });

      const state = useAuthStore.getState();

      expect(state.user).toEqual(providerUser);
      expect(state.accountType).toBe('provider');
      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(false);
    });
  });
});
