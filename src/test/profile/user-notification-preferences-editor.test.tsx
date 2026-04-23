// Phase 26 Step 26.3: тесты для UserNotificationPreferencesEditor.
// Компонент выводит 3 group-секции (booking/links/quarantine) с чекбоксами
// per NotificationType, REQUIRED-типы disabled + плашка «Нельзя отключить»,
// клик по non-required → debounced (500ms) PATCH /api/users/[id]/notification-preferences
// + toast success/error.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';
import { useToastStore } from '@/stores/useToastStore';
import type { User } from '@/types';

const user: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  name: 'Алексей',
  email: 'alexey@test',
  phone: '',
  password: 'secret',
  favoriteClubIds: [],
};

describe('UserNotificationPreferencesEditor (Step 26.3)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('рендерит 3 группы (booking / links / quarantine) для provider', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} accountType="provider" />);

    expect(screen.getByTestId('notification-preferences-editor')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-links')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-quarantine')).toBeInTheDocument();
  });

  it('Phase 26 Step 26.8: для athlete группа `links` скрыта, booking+quarantine видны', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} accountType="athlete" />);

    expect(screen.getByTestId('notification-preferences-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-quarantine')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-preferences-group-links')).not.toBeInTheDocument();
  });

  it('REQUIRED-типы имеют disabled input (нельзя отключить)', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} accountType="provider" />);

    // 3 REQUIRED_NOTIFICATION_TYPES: booking_confirmed, booking_cancelled_by_provider, quarantine_start
    expect(screen.getByTestId('notification-preferences-toggle-booking_confirmed')).toBeDisabled();
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_cancelled_by_provider'),
    ).toBeDisabled();
    expect(screen.getByTestId('notification-preferences-toggle-quarantine_start')).toBeDisabled();

    // А non-required (например booking_completed) — не disabled
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_completed'),
    ).not.toBeDisabled();
  });

  it('клик по non-required toggle обновляет checked и запускает debounced PATCH', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<UserNotificationPreferencesEditor userId={user.id} accountType="provider" />);
    const checkbox = screen.getByTestId(
      'notification-preferences-toggle-booking_completed',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    // До 500мс fetch не вызывается
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/users/1/notification-preferences');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.userId).toBe(1);
    expect(body.preferences.booking_completed).toBe(false);
  });

  it('success: PATCH 200 → toast success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<UserNotificationPreferencesEditor userId={user.id} accountType="provider" />);
    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_completed'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // После advanceTimersByTimeAsync microtask'и из savePrefs должны flushнуться.
    // Для надёжности ещё раз даём event loop'у завершить промисы.
    await act(async () => {
      await Promise.resolve();
    });

    expect(useToastStore.getState().toasts.some((t) => t.tone === 'success')).toBe(true);
  });

  it('error: PATCH 403 → toast error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<UserNotificationPreferencesEditor userId={user.id} accountType="provider" />);
    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_completed'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true);
  });

  it('клик по REQUIRED toggle не вызывает fetch (disabled-ветка)', async () => {
    render(<UserNotificationPreferencesEditor userId={user.id} accountType="provider" />);
    // jsdom физически позволяет fireEvent.click на disabled input, но onChange
    // handler должен быть защищён от REQUIRED-типов через canDisableNotificationType.
    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_confirmed'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
