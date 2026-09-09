// Тесты синхронизации города из auth-профиля в filter store (Step 19.9)
// При логине/регистрации/impersonation selectedCity обновляется из user.city
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CITY } from '@sporthub/types';
import { useSyncCityFromAuth } from '@/hooks/useSyncCityFromAuth';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';

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
        accountType: 'athlete',
        user: { name: 'Иван', email: 'ivan@test.ru', city: 'Москва' },
      });
    });

    expect(useFilterStore.getState().selectedCity).toBe('Москва');
  });

  it('при логине без city — selectedCity остаётся DEFAULT_CITY', () => {
    renderHook(() => useSyncCityFromAuth());

    act(() => {
      useAuthStore.getState().login({
        accountType: 'athlete',
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
        accountType: 'athlete',
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

  it('при impersonation — город берётся из профиля target-пользователя', () => {
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

    // Impersonation — target user из Москвы
    act(() => {
      useAuthStore
        .getState()
        .startImpersonation(
          { name: 'Марина', email: 'marina@test.ru', city: 'Москва' },
          'provider',
        );
    });

    expect(useFilterStore.getState().selectedCity).toBe('Москва');
  });

  it('при stopImpersonation — город возвращается к админу', () => {
    // Логин админа + impersonation
    act(() => {
      useAuthStore.getState().adminLogin({
        name: 'Admin',
        email: 'admin@test.ru',
        city: 'Екатеринбург',
      });
      useAuthStore
        .getState()
        .startImpersonation(
          { name: 'Марина', email: 'marina@test.ru', city: 'Москва' },
          'provider',
        );
    });

    renderHook(() => useSyncCityFromAuth());

    expect(useFilterStore.getState().selectedCity).toBe('Москва');

    act(() => {
      useAuthStore.getState().stopImpersonation();
    });

    expect(useFilterStore.getState().selectedCity).toBe('Екатеринбург');
  });

  it('при монтировании с авторизованным пользователем — город из профиля', () => {
    // Предварительно залогинен (имитация reload)
    useAuthStore.setState({
      isAuthenticated: true,
      user: { name: 'Иван', email: 'ivan@test.ru', city: 'Казань' },
      accountType: 'athlete',
    });

    renderHook(() => useSyncCityFromAuth());

    expect(useFilterStore.getState().selectedCity).toBe('Казань');
  });
});
