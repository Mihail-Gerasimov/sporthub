// Стор личности. Phase 34 Step 34.48: источник — ответ `GET /api/auth/me`,
// а не localStorage. Прежняя проверка «состояние поднимается из localStorage»
// заменена на «состояние приходит с сервера»; выход проверяется вместе
// с обращением к `POST /api/auth/logout` — без него сессия остаётся живой.
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { AuthAccountType, UserRole } from '@sporthub/types';
import {
  AUTH_STORE_DEFAULT_STATE,
  getPersonalCabinetConfig,
  PERSONAL_CABINET_CONFIG,
  selectAuthAccountType,
  selectAthleteActionUserId,
  useAuthStore,
  type AuthSessionUser,
} from '@/stores/useAuthStore';

const ATHLETE_USER_ID = 1;

const athleteUser: AuthSessionUser = {
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 (927) 000-10-10',
};

const providerUser: AuthSessionUser = {
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 (927) 000-20-20',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('сохраняет пользователя и тип аккаунта через login и register', () => {
    act(() => {
      useAuthStore.getState().login({
        accountType: 'athlete',
        user: athleteUser,
      });
    });

    expect(useAuthStore.getState().user).toEqual(athleteUser);
    expect(useAuthStore.getState().accountType).toBe('athlete');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    act(() => {
      useAuthStore.getState().register({
        accountType: 'provider',
        user: providerUser,
      });
    });

    expect(useAuthStore.getState().user).toEqual(providerUser);
    expect(useAuthStore.getState().accountType).toBe('provider');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('выход гасит сессию на сервере, а не только чистит стор', async () => {
    // ⚠️ Главное здесь — обращение к серверу. Очистить стор мало: сессия живёт
    // на сервере, и после «выхода» украденный идентификатор продолжал бы
    // работать до собственного срока.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    act(() => {
      useAuthStore.getState().login({
        accountType: 'provider',
        user: providerUser,
      });
    });

    await act(async () => {
      await useAuthStore.getState().logout();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accountType).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('берёт личность из ответа «кто я», а не из localStorage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: { ...athleteUser, id: ATHLETE_USER_ID, role: 'athlete', capabilities: [] },
        }),
    } as unknown as Response);

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    const state = useAuthStore.getState();

    expect(state.isAuthenticated).toBe(true);
    expect(state.accountType).toBe('athlete');
    expect(state.role).toBe('athlete');
    expect(state.user?.id).toBe(ATHLETE_USER_ID);
    expect(state.status).toBe('ready');
  });

  it('не хранит личность в localStorage', async () => {
    // Пока личность лежала в браузере, кабинет открывался правкой одной строки
    // в инструментах разработчика.
    act(() => {
      useAuthStore.getState().login({ accountType: 'athlete', user: athleteUser });
    });

    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? '');

    expect(stored.some((value) => value.includes(athleteUser.email))).toBe(false);
  });

  it('даёт читать accountType из auth-store после авторизации через selector', () => {
    act(() => {
      useAuthStore.getState().login({
        accountType: 'provider',
        user: providerUser,
      });
    });

    expect(selectAuthAccountType(useAuthStore.getState())).toBe('provider');
  });

  it('возвращает номер атлета только для athlete-действий', () => {
    act(() => {
      useAuthStore.getState().login({
        accountType: 'athlete',
        user: {
          ...athleteUser,
          id: ATHLETE_USER_ID,
        },
      });
    });

    expect(selectAthleteActionUserId(useAuthStore.getState())).toBe(ATHLETE_USER_ID);

    act(() => {
      useAuthStore.getState().login({
        accountType: 'provider',
        user: providerUser,
      });
    });

    expect(selectAthleteActionUserId(useAuthStore.getState())).toBeNull();
  });

  it('возвращает конфиг будущего личного кабинета по accountType', () => {
    expect(getPersonalCabinetConfig('provider')).toEqual(PERSONAL_CABINET_CONFIG.provider);
    expect(getPersonalCabinetConfig('athlete')).toEqual(PERSONAL_CABINET_CONFIG.athlete);
    expect(getPersonalCabinetConfig(null)).toBeNull();
  });

  it('использует отдельный AuthAccountType и не смешивает его с UserRole', () => {
    expectTypeOf<AuthAccountType>().not.toEqualTypeOf<UserRole>();
  });

  it('provider-кабинет имеет profilePath /profile/provider', () => {
    const config = getPersonalCabinetConfig('provider');

    expect(config?.profilePath).toBe('/profile/provider');
  });
});
