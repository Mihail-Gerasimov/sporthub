import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { AthleteUpcomingBookingCard } from '@/components/profile/AthleteUpcomingBookingCard';

describe('AthleteUpcomingBookingCard', () => {
  it('показывает тип записи, название, тренера, дату, время, место и action cancel', () => {
    render(
      <AthleteUpcomingBookingCard
        booking={{
          id: 77,
          bookingTypeLabel: 'Услуга тренера',
          clubName: 'Volna Aquatic Club',
          date: '2026-03-20',
          endTime: '09:15',
          locationLabel: 'Volna Aquatic Club · Бассейн A',
          startTime: '08:15',
          statusLabel: 'Подтверждена',
          statusTone: 'success',
          timeLabel: '08:15 - 09:15',
          title: 'Персональная тренировка: Плавание',
          trainerName: 'Марина Соколова',
        }}
      />,
    );

    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getByText('Персональная тренировка: Плавание')).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByText('20 марта')).toBeInTheDocument();
    expect(screen.getByText('08:15 - 09:15')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club · Бассейн A')).toBeInTheDocument();
    expect(screen.getByText('Подтверждена')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отменить запись' })).toBeInTheDocument();
  });
});
