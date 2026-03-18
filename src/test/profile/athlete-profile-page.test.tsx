import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import AthleteProfileRoute from '@/app/profile/athlete/page';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Review } from '@/types';

const profileBookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 21,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-19',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1100,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 19,
    userId: 1,
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    date: '2026-03-11',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 900,
  },
];

const profileReviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Отзыв 1',
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 3,
    rating: 5,
    text: 'Отзыв 2',
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    trainerId: 5,
    rating: 5,
    text: 'Отзыв 3',
  },
];

describe('AthleteProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  it('показывает athlete-only кабинет с данными пользователя из auth-state', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });

    render(await AthleteProfileRoute());

    expect(screen.getByRole('heading', { name: 'Кабинет спортсмена' })).toBeInTheDocument();
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('alexey@sporthub.local')).toBeInTheDocument();
    expect(screen.queryByText('Кабинет представителя спортивных услуг')).not.toBeInTheDocument();
  });

  it('для гостя показывает ограничение и открывает auth-модалку по CTA', async () => {
    render(await AthleteProfileRoute());

    expect(screen.getByText('Кабинет спортсмена доступен только после входа.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Войти или зарегистрироваться' }));

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
  });

  it('для provider не смешивает кабинеты и показывает отдельное ограничение', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'provider',
      user: {
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    render(await AthleteProfileRoute());

    expect(
      screen.getByText(
        'Ты вошёл как представитель спортивных услуг. Кабинет спортсмена недоступен.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Кабинет спортсмена' })).not.toBeInTheDocument();
  });

  it('для athlete показывает верхний профиль-блок, summary-метрики и logout', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });

    render(<AthleteProfilePage bookings={profileBookings} reviews={profileReviews} />);

    expect(screen.getByRole('heading', { name: 'Кабинет спортсмена' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Аватар Алексей Смирнов' })).toBeInTheDocument();
    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('1');
    expect(screen.getByTestId('athlete-summary-visits')).toHaveTextContent('1');
    expect(screen.getByTestId('athlete-summary-reviews')).toHaveTextContent('3');
    expect(screen.getByTestId('athlete-summary-achievements')).toHaveTextContent('3');
  });

  it('logout в кабинете спортсмена сбрасывает auth-state и возвращает ограничение доступа', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<AthleteProfilePage bookings={profileBookings} reviews={profileReviews} />);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByText('Кабинет спортсмена доступен только после входа.')).toBeInTheDocument();
  });
});
