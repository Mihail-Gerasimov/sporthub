/**
 * Интеграционные тесты admin-flow (Step 17.8).
 * Полный lifecycle: login → impersonation → навигация → возврат → logout.
 * Guard-сценарии, persistence, regression на существующий auth flow.
 */
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AUTH_STORAGE_KEY,
  AUTH_STORE_DEFAULT_STATE,
  MVP_ADMIN_USER_ID,
  MVP_ATHLETE_USER_ID,
  MVP_PROVIDER_USER_ID,
  selectAthleteActionUserId,
  useAuthStore,
  userRoleToAccountType,
  type AuthSessionUser,
} from '@/stores/useAuthStore';

// --- Seed данные (повторяют структуру из users.json) ---

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

describe('Admin integration (Step 17.8)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  // --- Полный admin lifecycle ---

  describe('полный admin lifecycle', () => {
    it('login → impersonate athlete → stop → impersonate provider → stop → logout', () => {
      // 1. Admin входит
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      expect(useAuthStore.getState().isAdmin).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().accountType).toBeNull();

      // 2. Impersonation: athlete
      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      expect(useAuthStore.getState().user).toEqual(athleteUser);
      expect(useAuthStore.getState().accountType).toBe('athlete');
      expect(useAuthStore.getState().isImpersonating).toBe(true);
      expect(useAuthStore.getState().adminOriginalUser).toEqual(adminUser);

      // 3. Возврат в панель
      act(() => {
        useAuthStore.getState().stopImpersonation();
      });

      expect(useAuthStore.getState().user).toEqual(adminUser);
      expect(useAuthStore.getState().accountType).toBeNull();
      expect(useAuthStore.getState().isImpersonating).toBe(false);
      expect(useAuthStore.getState().isAdmin).toBe(true);

      // 4. Impersonation: provider
      act(() => {
        useAuthStore.getState().startImpersonation(providerUser, 'provider');
      });

      expect(useAuthStore.getState().user).toEqual(providerUser);
      expect(useAuthStore.getState().accountType).toBe('provider');
      expect(useAuthStore.getState().isImpersonating).toBe(true);
      expect(useAuthStore.getState().adminOriginalUser).toEqual(adminUser);

      // 5. Возврат и logout
      act(() => {
        useAuthStore.getState().stopImpersonation();
      });

      act(() => {
        useAuthStore.getState().logout();
      });

      const finalState = useAuthStore.getState();

      expect(finalState.user).toBeNull();
      expect(finalState.isAuthenticated).toBe(false);
      expect(finalState.isAdmin).toBe(false);
      expect(finalState.isImpersonating).toBe(false);
      expect(finalState.adminOriginalUser).toBeNull();
      expect(finalState.accountType).toBeNull();
    });
  });

  // --- selectAthleteActionUserId при impersonation ---

  describe('selectAthleteActionUserId при impersonation', () => {
    it('возвращает userId целевого athlete при impersonation', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      const state = useAuthStore.getState();
      const userId = selectAthleteActionUserId(state);

      expect(userId).toBe(MVP_ATHLETE_USER_ID);
    });

    it('возвращает null для admin без impersonation (accountType=null)', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      const state = useAuthStore.getState();
      const userId = selectAthleteActionUserId(state);

      expect(userId).toBeNull();
    });

    it('возвращает null при impersonation как provider', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(providerUser, 'provider');
      });

      const state = useAuthStore.getState();
      const userId = selectAthleteActionUserId(state);

      expect(userId).toBeNull();
    });
  });

  // --- Повторный impersonation без возврата ---

  describe('повторный impersonation', () => {
    it('переключение между пользователями через stop → start сохраняет admin-контекст', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      // Первый impersonation — athlete
      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      expect(useAuthStore.getState().user).toEqual(athleteUser);

      // Возврат
      act(() => {
        useAuthStore.getState().stopImpersonation();
      });

      // Второй impersonation — provider (без logout между ними)
      act(() => {
        useAuthStore.getState().startImpersonation(providerUser, 'provider');
      });

      expect(useAuthStore.getState().user).toEqual(providerUser);
      expect(useAuthStore.getState().accountType).toBe('provider');
      expect(useAuthStore.getState().isAdmin).toBe(true);
      expect(useAuthStore.getState().adminOriginalUser).toEqual(adminUser);
    });
  });

  // --- Logout во время impersonation ---

  describe('logout во время impersonation', () => {
    it('полностью очищает все поля — admin не застревает под чужим аккаунтом', () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      // Logout прямо во время impersonation
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

  // --- Persistence при impersonation ---

  describe('persistence при перезагрузке', () => {
    it('admin-сессия без impersonation переживает перезагрузку', async () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      const persisted = localStorage.getItem(AUTH_STORAGE_KEY);

      expect(persisted).toBeTruthy();

      // Сброс и rehydration
      act(() => {
        useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
      });

      localStorage.setItem(AUTH_STORAGE_KEY, persisted!);

      await act(async () => {
        await useAuthStore.persist.rehydrate();
      });

      const state = useAuthStore.getState();

      expect(state.isAdmin).toBe(true);
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(adminUser);
      expect(state.accountType).toBeNull();
      expect(state.isImpersonating).toBe(false);
    });

    it('impersonation-контекст переживает перезагрузку — admin не застревает', async () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      const persisted = localStorage.getItem(AUTH_STORAGE_KEY);

      // Сброс и rehydration
      act(() => {
        useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
      });

      localStorage.setItem(AUTH_STORAGE_KEY, persisted!);

      await act(async () => {
        await useAuthStore.persist.rehydrate();
      });

      const state = useAuthStore.getState();

      // После перезагрузки — impersonation восстановлен
      expect(state.isAdmin).toBe(true);
      expect(state.isImpersonating).toBe(true);
      expect(state.user).toEqual(athleteUser);
      expect(state.accountType).toBe('athlete');
      expect(state.adminOriginalUser).toEqual(adminUser);

      // И stopImpersonation работает после rehydration
      act(() => {
        useAuthStore.getState().stopImpersonation();
      });

      expect(useAuthStore.getState().user).toEqual(adminUser);
      expect(useAuthStore.getState().isImpersonating).toBe(false);
    });
  });

  // --- userRoleToAccountType интеграция с impersonation ---

  describe('userRoleToAccountType → startImpersonation', () => {
    it('маппинг роли athlete корректно передаётся в startImpersonation', () => {
      const accountType = userRoleToAccountType('athlete');

      expect(accountType).toBe('athlete');

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, accountType!);
      });

      expect(useAuthStore.getState().accountType).toBe('athlete');
      expect(useAuthStore.getState().user).toEqual(athleteUser);
    });

    it('маппинг роли club_owner корректно передаётся как provider', () => {
      const accountType = userRoleToAccountType('club_owner');

      expect(accountType).toBe('provider');

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(providerUser, accountType!);
      });

      expect(useAuthStore.getState().accountType).toBe('provider');
    });

    it('маппинг роли admin возвращает null — impersonation невозможен', () => {
      const accountType = userRoleToAccountType('admin');

      expect(accountType).toBeNull();
    });
  });

  // --- Regression: стандартный auth flow не затронут ---

  describe('regression: стандартный auth flow', () => {
    it('обычный login → logout не затрагивает admin-поля', () => {
      // Обычный вход как athlete
      act(() => {
        useAuthStore.getState().login({
          accountType: 'athlete',
          user: athleteUser,
        });
      });

      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(useAuthStore.getState().isImpersonating).toBe(false);
      expect(useAuthStore.getState().adminOriginalUser).toBeNull();

      // Logout
      act(() => {
        useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(useAuthStore.getState().isImpersonating).toBe(false);
    });

    it('обычный register → selectAthleteActionUserId работает как раньше', () => {
      act(() => {
        useAuthStore.getState().register({
          accountType: 'athlete',
          user: athleteUser,
        });
      });

      const userId = selectAthleteActionUserId(useAuthStore.getState());

      expect(userId).toBe(MVP_ATHLETE_USER_ID);
    });

    it('обычный provider login → selectAthleteActionUserId возвращает null', () => {
      act(() => {
        useAuthStore.getState().login({
          accountType: 'provider',
          user: providerUser,
        });
      });

      const userId = selectAthleteActionUserId(useAuthStore.getState());

      expect(userId).toBeNull();
    });

    it('admin-поля не «заражают» обычный login после logout из admin-сессии', () => {
      // Сначала admin-сессия
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      // Logout
      act(() => {
        useAuthStore.getState().logout();
      });

      // Теперь обычный вход
      act(() => {
        useAuthStore.getState().login({
          accountType: 'athlete',
          user: athleteUser,
        });
      });

      const state = useAuthStore.getState();

      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
      expect(state.accountType).toBe('athlete');
      expect(state.user).toEqual(athleteUser);
    });
  });
});
