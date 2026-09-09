/**
 * Интеграционные тесты admin-flow (Step 17.8).
 * Полный lifecycle: вход → имперсонизация → навигация → возврат → выход.
 * Guard-сценарии и regression на обычный auth flow.
 *
 * Phase 34 Step 34.48: блок «persistence при перезагрузке» заменён на
 * «перезагрузка спрашивает сервер». Личность больше не лежит в localStorage,
 * и проверять надо не то, что она оттуда поднялась, а то, что она пришла
 * ответом «кто я».
 */
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_STORE_DEFAULT_STATE,
  selectAthleteActionUserId,
  useAuthStore,
  userRoleToAccountType,
  type AuthSessionUser,
} from '@/stores/useAuthStore';

// --- Данные стенда (повторяют общий набор пользователей) ---

const ADMIN_USER_ID = 3;
const ATHLETE_USER_ID = 1;
const PROVIDER_USER_ID = 2;

const adminUser: AuthSessionUser = {
  id: ADMIN_USER_ID,
  name: 'Администратор SportHub',
  email: 'admin@sporthub.local',
};

const athleteUser: AuthSessionUser = {
  id: ATHLETE_USER_ID,
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 (927) 000-10-10',
};

const providerUser: AuthSessionUser = {
  id: PROVIDER_USER_ID,
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 (927) 000-20-20',
};

/** Ответ «кто я» с ролью и правами. */
function meResponse(user: AuthSessionUser, role: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: { ...user, role, capabilities: [] } }),
  } as unknown as Response;
}

/** Успешный выход. Отдельная подмена нужна каждому тесту с `logout`. */
function stubLogout() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
}

describe('Admin integration (Step 17.8)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Полный admin lifecycle ---

  describe('полный admin lifecycle', () => {
    it('вход → имперсонизация athlete → возврат → имперсонизация provider → возврат → выход', async () => {
      stubLogout();

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

      await act(async () => {
        await useAuthStore.getState().logout();
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

      expect(userId).toBe(ATHLETE_USER_ID);
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
    it('полностью очищает все поля — admin не застревает под чужим аккаунтом', async () => {
      stubLogout();

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      // Выход прямо во время имперсонизации
      await act(async () => {
        await useAuthStore.getState().logout();
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

  // --- Перезагрузка страницы ---

  describe('перезагрузка спрашивает сервер', () => {
    it('admin-сессия восстанавливается ответом «кто я»', async () => {
      // Полная перезагрузка: стор пуст, восстановить его неоткуда, кроме сервера.
      useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAdmin).toBe(true);
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.accountType).toBeNull();
      expect(state.isImpersonating).toBe(false);
    });

    it('имперсонизация перезагрузку НЕ переживает, и это правильно', async () => {
      // Сервер о подмене личности не знает: сессия всё это время принадлежит
      // администратору. Пока подмена жила в localStorage, экран и настоящие права
      // расходились — интерфейс показывал одного человека, данные приходили
      // другому. Перезагрузка честно возвращает администратора к себе.
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });
      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.isAdmin).toBe(true);
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
    it('обычный вход → выход не затрагивает admin-поля', async () => {
      stubLogout();

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

      // Выход
      await act(async () => {
        await useAuthStore.getState().logout();
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

      expect(userId).toBe(ATHLETE_USER_ID);
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

    it('admin-поля не «заражают» обычный вход после выхода из admin-сессии', async () => {
      stubLogout();

      // Сначала admin-сессия
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      // Выход
      await act(async () => {
        await useAuthStore.getState().logout();
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
