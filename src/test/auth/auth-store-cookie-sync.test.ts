// Синхронизация cookie и useAuthStore: каждое мутирующее действие
// (login/register/logout/adminLogin/startImpersonation/stopImpersonation)
// должно обновлять или стирать `sh-auth-user-id` cookie, чтобы Server Components
// могли прочитать текущего юзера.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AUTH_USER_ID_COOKIE_NAME, readAuthUserIdCookie } from '@/lib/auth-cookie';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { AuthAccountType } from '@/types';

const provider = {
  id: 2,
  name: 'Марина',
  email: 'marina@studio.local',
};

const athlete = {
  id: 1,
  name: 'Алексей',
  email: 'alexey@sporthub.local',
};

const admin = {
  id: 3,
  name: 'Админ',
  email: 'admin@sporthub.local',
};

function wipeAllCookies() {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const eqPos = cookie.indexOf('=');
    const name = (eqPos > -1 ? cookie.substring(0, eqPos) : cookie).trim();
    if (name) {
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
}

describe('useAuthStore ↔ auth-cookie sync', () => {
  beforeEach(() => {
    wipeAllCookies();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    wipeAllCookies();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('login пишет userId в cookie', () => {
    useAuthStore.getState().login({ user: provider, accountType: 'provider' });

    expect(readAuthUserIdCookie()).toBe(provider.id);
    expect(document.cookie).toContain(`${AUTH_USER_ID_COOKIE_NAME}=${provider.id}`);
  });

  it('register пишет userId в cookie', () => {
    useAuthStore.getState().register({ user: athlete, accountType: 'athlete' });

    expect(readAuthUserIdCookie()).toBe(athlete.id);
  });

  it('logout стирает cookie', () => {
    useAuthStore.getState().login({ user: provider, accountType: 'provider' });
    expect(readAuthUserIdCookie()).toBe(provider.id);

    useAuthStore.getState().logout();
    expect(readAuthUserIdCookie()).toBeNull();
  });

  it('adminLogin пишет userId админа в cookie', () => {
    useAuthStore.getState().adminLogin(admin);

    expect(readAuthUserIdCookie()).toBe(admin.id);
  });

  it('startImpersonation пишет userId target-юзера в cookie', () => {
    useAuthStore.getState().adminLogin(admin);
    expect(readAuthUserIdCookie()).toBe(admin.id);

    useAuthStore.getState().startImpersonation(provider, 'provider' as AuthAccountType);

    expect(readAuthUserIdCookie()).toBe(provider.id);
  });

  it('stopImpersonation возвращает cookie на id админа', () => {
    useAuthStore.getState().adminLogin(admin);
    useAuthStore.getState().startImpersonation(provider, 'provider');
    expect(readAuthUserIdCookie()).toBe(provider.id);

    useAuthStore.getState().stopImpersonation();
    expect(readAuthUserIdCookie()).toBe(admin.id);
  });

  it('login без user.id не ставит cookie (edge-case — гостевой флоу невалиден, но не падаем)', () => {
    const userWithoutId = { name: 'Noid', email: 'noid@test' };
    useAuthStore.getState().login({ user: userWithoutId, accountType: 'athlete' });

    expect(readAuthUserIdCookie()).toBeNull();
  });
});
