// Тесты страницы кабинета провайдера (Step 12.4)
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';
import {
  AUTH_STORE_DEFAULT_STATE,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
} from '@/stores/useAuthStore';

describe('ProviderProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('показывает «Доступ ограничен» для неавторизованного пользователя', () => {
    render(<ProviderProfilePage />);

    expect(screen.getByText('Доступ ограничен')).toBeInTheDocument();
    expect(screen.getByText(/Кабинет представителя/)).toBeInTheDocument();
  });

  it('показывает «Доступ ограничен» для athlete', () => {
    useAuthStore.getState().login({
      accountType: 'athlete',
      user: { id: 1, name: 'Алексей', email: 'a@b.ru' },
    });

    render(<ProviderProfilePage />);

    expect(screen.getByText('Доступ ограничен')).toBeInTheDocument();
  });

  it('рендерит шапку и сводку для авторизованного provider', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина Крылова', email: 'marina@studio.local' },
    });

    render(
      <ProviderProfilePage
        clubs={[
          {
            id: 1,
            createdAt: '',
            name: 'Club A',
            slug: '',
            description: '',
            shortDescription: '',
            city: '',
            address: '',
            phone: '',
            coordinates: { lat: 0, lng: 0 },
            sportIds: [],
            imageUrls: [],
            amenities: [],
            tags: [],
            rating: 4.5,
            reviewCount: 5,
            priceFrom: 0,
            distanceKm: 0,
            isFeatured: false,
            managedByUserId: MVP_PROVIDER_USER_ID,
          },
        ]}
        trainers={[
          {
            id: 1,
            createdAt: '',
            name: 'Trainer A',
            slug: '',
            bio: '',
            avatarUrl: '',
            experienceYears: 5,
            specialties: [],
            rating: 4.8,
            reviewCount: 3,
            priceFrom: 0,
            sportIds: [],
            managedByUserId: MVP_PROVIDER_USER_ID,
          },
        ]}
        bookings={[
          {
            id: 1,
            createdAt: '',
            scheduleId: 1,
            userId: 1,
            clubId: 1,
            sportId: 3,
            date: '2026-03-18',
            status: 'confirmed',
            paymentStatus: 'paid',
            totalPrice: 1100,
          },
        ]}
        reviews={[
          {
            id: 1,
            createdAt: '',
            userId: 1,
            clubId: 1,
            rating: 5,
            text: 'Отлично!',
          },
        ]}
      />,
    );

    // Шапка
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
    expect(screen.getByText('Кабинет представителя')).toBeInTheDocument();

    // Сводка — 4 KPI-карточки
    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('2');
    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('1');
    expect(screen.getByTestId('provider-summary-reviews')).toHaveTextContent('1');
    expect(screen.getByTestId('provider-summary-rating')).toHaveTextContent('5');
  });

  it('показывает тост при нажатии на кнопку-заглушку «Опубликовать клуб»', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: /Опубликовать клуб/ }));

    expect(screen.getByText(/Скоро будет доступно/)).toBeInTheDocument();
  });

  it('рендерит кнопку «Выйти» и выходит по клику', () => {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: { id: MVP_PROVIDER_USER_ID, name: 'Марина', email: 'm@b.ru' },
    });

    render(<ProviderProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
