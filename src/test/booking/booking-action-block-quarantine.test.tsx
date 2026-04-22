// Step 25.7: BookingActionBlock respects quarantine — disabled CTA + плашка,
// если для текущего athleteUserId есть запись в quarantineByUserId c inQuarantine=true.
// Проп передаётся из server page /booking/[scheduleId] (пересчёт на лету для всех
// athlete-пользователей через isAthleteInQuarantine).
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { BookingActionBlock } from '@/components/booking/BookingActionBlock';
import { AUTH_STORE_DEFAULT_STATE, MVP_ATHLETE_USER_ID, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { QuarantineResult } from '@/lib/reliability';

describe('BookingActionBlock — quarantine (Step 25.7)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);

    // Стандартный fetch booking-state возвращает пустой массив — без duplicate.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('при inQuarantine для athleteUserId: CTA disabled с текстом «В карантине», плашка видна', () => {
    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: MVP_ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    const quarantineByUserId: Record<number, QuarantineResult> = {
      [MVP_ATHLETE_USER_ID]: {
        inQuarantine: true,
        until: '2026-04-29T12:00:00.000Z',
        reason: '3 неявки подряд — записи временно ограничены',
      },
    };

    render(
      <BookingActionBlock
        scheduleId={1001}
        slotTitle="Персональная тренировка: Плавание"
        ownerName="Марина Соколова"
        ownerTypeLabel="Услуга тренера"
        dateLabel="29 апреля"
        timeLabel="08:15 - 09:15"
        availableSpots={1}
        quarantineByUserId={quarantineByUserId}
      />,
    );

    const cta = screen.getByRole('button', { name: /в карантине/i });
    expect(cta).toBeDisabled();
    expect(screen.getByTestId('booking-action-quarantine-notice')).toBeInTheDocument();
    expect(screen.getByText(/до 29/)).toBeInTheDocument();
  });

  it('при inQuarantine=false CTA «Подтвердить запись» активен и плашка скрыта', async () => {
    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: MVP_ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    const quarantineByUserId: Record<number, QuarantineResult> = {
      [MVP_ATHLETE_USER_ID]: { inQuarantine: false },
    };

    render(
      <BookingActionBlock
        scheduleId={1001}
        slotTitle="Персональная тренировка: Плавание"
        ownerName="Марина Соколова"
        ownerTypeLabel="Услуга тренера"
        dateLabel="29 апреля"
        timeLabel="08:15 - 09:15"
        availableSpots={1}
        quarantineByUserId={quarantineByUserId}
      />,
    );

    expect(screen.queryByTestId('booking-action-quarantine-notice')).not.toBeInTheDocument();
    // Подтвердить запись доступно после окончания async checkBookingState.
    const cta = await screen.findByRole('button', { name: 'Подтвердить запись' });
    expect(cta).toBeEnabled();
  });
});
