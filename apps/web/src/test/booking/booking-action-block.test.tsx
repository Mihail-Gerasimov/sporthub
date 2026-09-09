// Тесты client action block на booking page: состояния, create-flow и notices (Step 16.3)
// Phase 24 Step 24.6: используем renderWithToast для автоматического монтирования
// ToastStack рядом с компонентом — toast-сообщения проверяются через screen.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { BookingActionBlock } from '@/components/booking/BookingActionBlock';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

// Номера пользователей стенда. Раньше они приезжали константами из стора —
// фронт знал наперёд, кто атлет, провайдер и администратор. Теперь это просто
// данные теста.
const ATHLETE_USER_ID = 1;
const PROVIDER_USER_ID = 2;

describe('BookingActionBlock', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  function createJsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
      },
    });
  }

  function renderActionBlock() {
    return render(
      <BookingActionBlock
        scheduleId={1001}
        slotTitle="Персональная тренировка: Плавание"
        ownerName="Марина Соколова"
        ownerTypeLabel="Услуга тренера"
        dateLabel="20 марта"
        timeLabel="08:15 - 09:15"
        availableSpots={1}
      />,
    );
  }

  it('для guest показывает auth-state и открывает auth modal', () => {
    renderActionBlock();

    expect(screen.getByTestId('booking-action-block')).toBeInTheDocument();
    expect(screen.getByText('Чтобы записаться, войдите как спортсмен')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Войти / Зарегистрироваться' }));

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('для provider-session показывает запрет на booking и CTA на смену аккаунта', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: {
        id: PROVIDER_USER_ID,
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    renderActionBlock();

    expect(
      screen.getByText('Текущий аккаунт не может записываться на занятия'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('для полного slot показывает состояние «мест нет» и блокирует primary action', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
        data: [],
      }),
    );

    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <BookingActionBlock
        scheduleId={1001}
        slotTitle="Персональная тренировка: Плавание"
        ownerName="Марина Соколова"
        ownerTypeLabel="Услуга тренера"
        dateLabel="20 марта"
        timeLabel="08:15 - 09:15"
        availableSpots={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Мест нет' })).toBeDisabled();
    });
  });

  // Phase 27 Step 27.1: отменённый booking на том же слоте НЕ должен считаться
  // дубликатом — атлет должен иметь возможность записаться повторно.
  // Фильтр ACTIVE_BOOKING_STATUSES в `BookingActionBlock` защищает от того, что
  // отменённая запись перекрывает primary action (ранее — Link «Перейти в ЛК»).
  it('после cancelled_by_provider на том же слоте показывает «Подтвердить запись»', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
        data: [
          {
            id: 78,
            createdAt: '2026-03-18T12:00:00.000Z',
            scheduleId: 1001,
            userId: ATHLETE_USER_ID,
            sportId: 3,
            date: '2026-03-20',
            status: 'cancelled_by_provider',
            paymentStatus: 'unpaid',
            totalPrice: 1400,
          },
        ],
      }),
    );

    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    renderActionBlock();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toBeEnabled();
    });

    // Линка «Перейти в ЛК» быть не должно: отменённая запись не блокирует новую попытку.
    expect(screen.queryByRole('link', { name: 'Перейти в ЛК' })).not.toBeInTheDocument();
  });

  it('для duplicate booking показывает CTA «Перейти в ЛК» вместо confirm-action', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
        data: [
          {
            id: 77,
            createdAt: '2026-03-18T12:00:00.000Z',
            scheduleId: 1001,
            userId: ATHLETE_USER_ID,
            sportId: 3,
            date: '2026-03-20',
            status: 'confirmed',
            paymentStatus: 'unpaid',
            totalPrice: 1400,
          },
        ],
      }),
    );

    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    renderActionBlock();

    await waitFor(() => {
      expect(screen.getByText('Вы уже записаны на этот слот')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Перейти в ЛК' })).toHaveAttribute(
      'href',
      '/profile/athlete/dashboard',
    );
    expect(screen.queryByRole('button', { name: 'Подтвердить запись' })).not.toBeInTheDocument();
  });

  it('для athlete отправляет POST с минимальным payload, показывает success-notice и делает router.refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: [],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            success: true,
            data: {
              id: 501,
              createdAt: '2026-03-18T12:10:00.000Z',
              scheduleId: 1001,
              userId: ATHLETE_USER_ID,
              sportId: 3,
              date: '2026-03-20',
              status: 'confirmed',
              paymentStatus: 'unpaid',
              totalPrice: 1400,
            },
          },
          201,
        ),
      );

    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    renderActionBlock();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Первый запрос — проверка «нет ли уже записи на этот слот». Он тоже идёт
    // БЕЗ номера в адресе: маршрут отдаёт записи того, кто спрашивает.
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings');

    const postCall = fetchMock.mock.calls[1];

    expect(postCall[0]).toBe('/api/bookings');
    expect(postCall[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    // ⚠️ В теле ТОЛЬКО номер слота. Записывается тот, чья сессия: прежнее поле
    // `userId` позволяло записать на занятие кого угодно правкой запроса.
    expect(JSON.parse(postCall[1].body as string)).toEqual({ scheduleId: 1001 });

    await waitFor(() => {
      expect(screen.getByText('Запись подтверждена. Слот закреплён за вами.')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Перейти в ЛК' })).toHaveAttribute(
      'href',
      '/profile/athlete/dashboard',
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('показывает error-notice, если POST завершился ошибкой', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: [],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            success: false,
            error: 'Пользователь уже записан на это занятие',
          },
          409,
        ),
      );

    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    renderActionBlock();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => {
      expect(screen.getByText('Пользователь уже записан на это занятие')).toBeInTheDocument();
    });

    expect(refreshMock).not.toHaveBeenCalled();
  });
});
