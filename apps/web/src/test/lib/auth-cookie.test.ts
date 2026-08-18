// Тесты client-side helpers `auth-cookie`: запись/чтение/очистка cookie.
// jsdom реалистично обрабатывает document.cookie (включая max-age=0 для стирания).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AUTH_USER_ID_COOKIE_NAME,
  clearAuthUserIdCookie,
  readAuthUserIdCookie,
  setAuthUserIdCookie,
} from '@/lib/auth-cookie';

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

describe('auth-cookie client helpers', () => {
  beforeEach(() => {
    wipeAllCookies();
  });

  afterEach(() => {
    wipeAllCookies();
  });

  it('setAuthUserIdCookie записывает userId в document.cookie', () => {
    setAuthUserIdCookie(42);
    expect(document.cookie).toContain(`${AUTH_USER_ID_COOKIE_NAME}=42`);
  });

  it('readAuthUserIdCookie возвращает число', () => {
    setAuthUserIdCookie(7);
    expect(readAuthUserIdCookie()).toBe(7);
  });

  it('readAuthUserIdCookie возвращает null, если cookie отсутствует', () => {
    expect(readAuthUserIdCookie()).toBeNull();
  });

  it('clearAuthUserIdCookie стирает cookie (max-age=0)', () => {
    setAuthUserIdCookie(5);
    expect(readAuthUserIdCookie()).toBe(5);
    clearAuthUserIdCookie();
    expect(readAuthUserIdCookie()).toBeNull();
  });

  it('readAuthUserIdCookie возвращает null при нечисловом значении', () => {
    document.cookie = `${AUTH_USER_ID_COOKIE_NAME}=notanumber; path=/`;
    expect(readAuthUserIdCookie()).toBeNull();
  });

  it('setAuthUserIdCookie перезаписывает предыдущее значение', () => {
    setAuthUserIdCookie(1);
    setAuthUserIdCookie(9);
    expect(readAuthUserIdCookie()).toBe(9);
  });
});
