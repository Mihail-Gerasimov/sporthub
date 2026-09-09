/**
 * Тесты admin-расширения auth store (Step 17.2).
 * Покрывают: adminLogin, startImpersonation, stopImpersonation,
 * выход при имперсонизации, восстановление личности с сервера,
 * userRoleToAccountType.
 *
 * Phase 34 Step 34.48: личность больше не хранится в localStorage — она
 * приходит ответом `GET /api/auth/me`. Прежний тест «поля переживают
 * перезагрузку через localStorage» заменён на «после перезагрузки личность
 * восстанавливается с сервера», потому что проверять надо именно это.
 */
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_STORE_DEFAULT_STATE,
  useAuthStore,
  userRoleToAccountType,
  type AuthSessionUser,
} from '@/stores/useAuthStore';

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

/** Ответ «кто я» с ролью и правами — ровно та форма, что приходит с сервера. */
function meResponse(user: AuthSessionUser, role: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: { ...user, role, capabilities: [] } }),
  } as unknown as Response;
}

/** Ответ «вошедшего нет». */
function guestResponse() {
  return { ok: false, status: 401, json: () => Promise.resolve({}) } as unknown as Response;
}

describe('Admin auth store (Step 17.2)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    it('полностью очищает все поля включая admin/impersonation', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, status: 200 } as Response);

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      act(() => {
        useAuthStore.getState().startImpersonation(athleteUser, 'athlete');
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      const state = useAuthStore.getState();

      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(state.user).toBeNull();
      expect(state.accountType).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAdmin).toBe(false);
      expect(state.isImpersonating).toBe(false);
      expect(state.adminOriginalUser).toBeNull();
    });

    it('очищает состояние даже если сервер недоступен', async () => {
      // Иначе сбой сети оставлял бы человека внутри интерфейса: кнопка нажата,
      // а на экране по-прежнему его кабинет.
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));

      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  // --- восстановление личности с сервера ---

  describe('loadSession', () => {
    it('восстанавливает admin-сессию ответом «кто я», без localStorage', async () => {
      // Полная перезагрузка страницы: стор пуст, localStorage не при делах.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(meResponse(adminUser, 'admin'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(true);
      expect(state.role).toBe('admin');
      expect(state.accountType).toBeNull();
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.status).toBe('ready');
    });

    it('имперсонизация НЕ переживает перезагрузку — сервер о ней не знает', async () => {
      // Раньше подменённая личность лежала в localStorage и «переживала»
      // перезагрузку. Сервер при этом продолжал видеть администратора: экран
      // и настоящие права расходились. Теперь ответ «кто я» — единственный
      // источник, и перезагрузка честно возвращает админа к себе.
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
    });

    it('отказ сессии обнуляет стор — вход не «прилипает» к браузеру', async () => {
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(guestResponse());

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.isAdmin).toBe(false);
      expect(state.user).toBeNull();
      expect(state.status).toBe('ready');
    });

    it('недоступный сервер не выкидывает вошедшего, но снимает ожидание', async () => {
      // Разница принципиальная: «сессии нет» и «спросить не удалось» — не одно
      // и то же. Второе не должно выглядеть как выход из системы.
      act(() => {
        useAuthStore.getState().adminLogin(adminUser);
      });

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.status).toBe('ready');
    });

    it('роль из ответа определяет кабинет: club_owner → provider', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(meResponse(providerUser, 'club_owner'));

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      expect(useAuthStore.getState().accountType).toBe('provider');
      expect(useAuthStore.getState().isAdmin).toBe(false);
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
