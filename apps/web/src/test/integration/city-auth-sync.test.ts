// Тесты синхронизации города из auth-профиля в filter store (Step 19.9)
// При логине/регистрации/impersonation selectedCity обновляется из user.city
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CITY } from '@sporthub/types';
import { useSyncCityFromAuth } from '@/hooks/useSyncCityFromAuth';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';

/**
 * Стенд сессии: «кто я» отвечает переданным профилем, изменяющие маршруты —
 * согласием. Личность после них стор всё равно перечитывает.
 */
function stubSession(profile: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: profile }),
      } as unknown as Response);
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as unknown as Response);
  });
}

describe('useSyncCityFromAuth (Step 19.9)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useFilterStore.getState().resetFilters();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('при логине с city — selectedCity обновляется из профиля', () => {
    renderHook(() => useSyncCityFromAuth());

    act(() => {
      useAuthStore.getState().login({
        user: { name: 'Иван', email: 'ivan@test.ru', city: 'Москва' },
      });
    });

    expect(useFilterStore.getState().selectedCity).toBe('Москва');
  });

  it('при логине без city — selectedCity остаётся DEFAULT_CITY', () => {
    renderHook(() => useSyncCityFromAuth());

    act(() => {
      useAuthStore.getState().login({
        user: { name: 'Иван', email: 'ivan@test.ru' },
      });
    });

    expect(useFilterStore.getState().selectedCity).toBe(DEFAULT_CITY);
  });

  it('при выходе — selectedCity сбрасывается к DEFAULT_CITY', async () => {
    // Выход теперь ходит на сервер: сессию гасит он, а не очистка стора.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    // Сначала логин с городом
    act(() => {
      useAuthStore.getState().login({
        user: { name: 'Иван', email: 'ivan@test.ru', city: 'Казань' },
      });
    });

    renderHook(() => useSyncCityFromAuth());

    // Проверяем что город установлен
    expect(useFilterStore.getState().selectedCity).toBe('Казань');

    await act(async () => {
      await useAuthStore.getState().logout();
    });

    expect(useFilterStore.getState().selectedCity).toBe(DEFAULT_CITY);
  });

  it('при impersonation — город берётся из профиля target-пользователя', async () => {
    // Работу от чужого лица начинает сервер, а личность стор перечитывает
    // ответом «кто я» — оттуда же приезжает и город.
    stubSession({
      id: 2,
      name: 'Марина',
      email: 'marina@test.ru',
      city: 'Москва',
      role: 'club_owner',
      capabilities: [],
      impersonating: true,
      actorName: 'Admin',
    });

    // Логин админа
    act(() => {
      useAuthStore.getState().adminLogin({
        name: 'Admin',
        email: 'admin@test.ru',
        city: 'Самара',
      });
    });

    renderHook(() => useSyncCityFromAuth());

    expect(useFilterStore.getState().selectedCity).toBe('Самара');

    await act(async () => {
      await useAuthStore.getState().startImpersonation(2);
    });

    expect(useFilterStore.getState().selectedCity).toBe('Москва');
  });

  it('при stopImpersonation — город возвращается к админу', async () => {
    // Возврат к себе тоже делает сервер: он гасит подменённую сессию, а стор
    // берёт из ответа личность администратора вместе с его городом.
    stubSession({
      id: 3,
      name: 'Admin',
      email: 'admin@test.ru',
      city: 'Екатеринбург',
      role: 'admin',
      capabilities: [],
    });

    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      isAuthenticated: true,
      isAdmin: true,
      isImpersonating: true,
      accountKind: 'person',
      user: { id: 2, name: 'Марина', email: 'marina@test.ru', city: 'Москва' },
      adminOriginalUser: { name: 'Admin' },
    });

    renderHook(() => useSyncCityFromAuth());

    expect(useFilterStore.getState().selectedCity).toBe('Москва');

    await act(async () => {
      await useAuthStore.getState().stopImpersonation();
    });

    expect(useFilterStore.getState().selectedCity).toBe('Екатеринбург');
  });

  it('при монтировании с авторизованным пользователем — город из профиля', () => {
    // Предварительно залогинен (имитация reload)
    useAuthStore.setState({
      isAuthenticated: true,
      user: { name: 'Иван', email: 'ivan@test.ru', city: 'Казань' },
      accountKind: 'person',
    });

    renderHook(() => useSyncCityFromAuth());

    expect(useFilterStore.getState().selectedCity).toBe('Казань');
  });
});
