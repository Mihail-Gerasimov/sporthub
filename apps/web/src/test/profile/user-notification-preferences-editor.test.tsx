// Phase 26 Step 26.3: тесты для UserNotificationPreferencesEditor.
// Компонент выводит group-секции (booking/links/reviews) с чекбоксами
// per NotificationType, REQUIRED-типы disabled + плашка «Нельзя отключить»,
// клик по non-required → debounced (500ms) PATCH /api/users/[id]/notification-preferences
// + toast success/error.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';
import { useToastStore } from '@/stores/useToastStore';
import type { User } from '@sporthub/types';

const user: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей',
  email: 'alexey@test',
  phone: '',
  passwordHash: 'secret',
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

  it('рендерит группы (booking / links / reviews) для provider', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);

    expect(screen.getByTestId('notification-preferences-editor')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-links')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-reviews')).toBeInTheDocument();
  });

  // ⚠️ Шаг 35.28a. Здесь было два теста, закреплявших прежнюю модель: у атлета
  // прятались «провайдерские» переключатели, у провайдера — «атлетские».
  // Модель «тип → роль» удалена вместе с ролями: настройки принадлежат ЧЕЛОВЕКУ,
  // а человек с клубом и сам ходит на занятия. Спрятанный переключатель означал бы
  // уведомление, которое приходит и которое нечем выключить.
  it('переключатели показываются целиком — и «свои», и «провайдерские»', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);

    // Обе оси группы «Записи» на месте: заявка провайдеру и подтверждение атлету.
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_requested'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_confirmed'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        'notification-preferences-toggle-booking_cancelled_by_athlete_to_provider',
      ),
    ).toBeInTheDocument();

    // И все три группы: прятать «Связи» больше не от чего.
    expect(screen.getByTestId('notification-preferences-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-links')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-group-reviews')).toBeInTheDocument();
  });

  it('REQUIRED-типы имеют disabled input (нельзя отключить)', () => {
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);

    // REQUIRED_NOTIFICATION_TYPES: booking_confirmed и booking_cancelled_by_provider.
    // Phase 27 Step 27.3: оба адресованы athlete, рендерятся только в athlete-виде.
    expect(screen.getByTestId('notification-preferences-toggle-booking_confirmed')).toBeDisabled();
    expect(
      screen.getByTestId('notification-preferences-toggle-booking_cancelled_by_provider'),
    ).toBeDisabled();

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

    // Phase 27 Step 27.3: booking_completed адресован athlete, рендерится только
    // в athlete-виде. Проверяем именно этот путь для клика по non-required.
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
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
    // ⚠️ В теле только настройки. Номер уходит лишь в АДРЕС маршрута, и сервер
    // сверяет его с сессией; схема тела строгая — прежнее `userId` она отвергает.
    expect(Object.keys(body)).toEqual(['preferences']);
    expect(body.preferences.booking_completed).toBe(false);
  });

  it('success: PATCH 200 → toast success', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
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

    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
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
    render(<UserNotificationPreferencesEditor userId={user.id} notificationPreferences={{}} />);
    // jsdom физически позволяет fireEvent.click на disabled input, но onChange
    // handler должен быть защищён от REQUIRED-типов через canDisableNotificationType.
    // booking_confirmed — athlete-адресованный REQUIRED-тип.
    fireEvent.click(screen.getByTestId('notification-preferences-toggle-booking_confirmed'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
