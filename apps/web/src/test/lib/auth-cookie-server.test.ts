// Тесты server-side helper `getAuthUserIdFromCookies`: читает cookie через next/headers.
// vi.mock замокивает `cookies` из next/headers; helper парсит значение в number или возвращает null.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookiesFn: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookiesFn,
}));

import { AUTH_USER_ID_COOKIE_NAME } from '@/lib/auth-cookie';
import { getAuthUserIdFromCookies } from '@/lib/auth-cookie-server';

function mockStoreWith(value: string | undefined) {
  mocks.cookiesFn.mockResolvedValue({
    get: (name: string) =>
      name === AUTH_USER_ID_COOKIE_NAME && value !== undefined ? { value } : undefined,
  });
}

describe('getAuthUserIdFromCookies (server-side)', () => {
  beforeEach(() => {
    mocks.cookiesFn.mockReset();
  });

  it('возвращает число из cookie', async () => {
    mockStoreWith('4');
    expect(await getAuthUserIdFromCookies()).toBe(4);
  });

  it('возвращает null, если cookie отсутствует', async () => {
    mockStoreWith(undefined);
    expect(await getAuthUserIdFromCookies()).toBeNull();
  });

  it('возвращает null при нечисловом значении cookie', async () => {
    mockStoreWith('abc');
    expect(await getAuthUserIdFromCookies()).toBeNull();
  });

  it('возвращает null при пустом значении cookie', async () => {
    mockStoreWith('');
    expect(await getAuthUserIdFromCookies()).toBeNull();
  });
});
