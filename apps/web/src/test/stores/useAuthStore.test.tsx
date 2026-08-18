import { act } from '@testing-library/react';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';

import type { AuthAccountType, UserRole } from '@sporthub/types';
import {
  AUTH_STORAGE_KEY,
  AUTH_STORE_DEFAULT_STATE,
  getPersonalCabinetConfig,
  MVP_ATHLETE_USER_ID,
  MVP_PROVIDER_USER_ID,
  PERSONAL_CABINET_CONFIG,
  selectAuthAccountType,
  selectAthleteActionUserId,
  useAuthStore,
  type AuthSessionUser,
} from '@/stores/useAuthStore';

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
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
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

  it('очищает состояние через logout', () => {
    act(() => {
      useAuthStore.getState().login({
        accountType: 'provider',
        user: providerUser,
      });
    });

    act(() => {
      useAuthStore.getState().logout();
    });

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accountType).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('восстанавливает состояние из localStorage через persistence', async () => {
    act(() => {
      useAuthStore.getState().login({
        accountType: 'athlete',
        user: athleteUser,
      });
    });

    const persistedValue = localStorage.getItem(AUTH_STORAGE_KEY);

    expect(persistedValue).toContain('athlete');

    act(() => {
      useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    });

    localStorage.setItem(AUTH_STORAGE_KEY, persistedValue ?? '');

    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });

    expect(useAuthStore.getState().user).toEqual(athleteUser);
    expect(useAuthStore.getState().accountType).toBe('athlete');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
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

  it('возвращает fake athlete userId только для athlete-only действий', () => {
    act(() => {
      useAuthStore.getState().login({
        accountType: 'athlete',
        user: {
          ...athleteUser,
          id: MVP_ATHLETE_USER_ID,
        },
      });
    });

    expect(selectAthleteActionUserId(useAuthStore.getState())).toBe(MVP_ATHLETE_USER_ID);

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

  it('экспортирует MVP_PROVIDER_USER_ID = 2 для fake-провайдера', () => {
    expect(MVP_PROVIDER_USER_ID).toBe(2);
  });

  it('provider-кабинет имеет profilePath /profile/provider', () => {
    const config = getPersonalCabinetConfig('provider');

    expect(config?.profilePath).toBe('/profile/provider');
  });
});
