import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClubDetailPageClient } from '@/components/clubs/ClubDetailPageClient';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Club, Review, Schedule, Sport, Trainer } from '@/types';

const club: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном, утренними дорожками и спокойным восстановлением.',
  shortDescription: 'Бассейн и пилатес рядом с набережной.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  email: 'hello@volna-club.ru',
  website: 'https://volna-club.ru',
  coordinates: {
    lat: 53.2129,
    lng: 50.1245,
  },
  sportIds: [3, 8],
  imageUrls: ['/images/clubs/volna-1.jpg', '/images/clubs/volna-2.jpg'],
  amenities: ['Бассейн 25 м', 'Сауна'],
  tags: ['Бассейн', 'Восстановление'],
  rating: 4.8,
  reviewCount: 64,
  priceFrom: 900,
  distanceKm: 1.8,
  isFeatured: true,
};

const sports: Sport[] = [
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Плавание',
    slug: 'swimming',
    description: 'Плавание',
    icon: '🏊',
    imageUrl: '/images/sports/swimming.jpg',
    isPopular: true,
  },
  {
    id: 8,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Пилатес',
    slug: 'pilates',
    description: 'Пилатес',
    icon: '🤸',
    imageUrl: '/images/sports/pilates.jpg',
    isPopular: true,
  },
];

const trainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    sportIds: [3],
    sportId: 3,
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: 'Тренер по плаванию с мягким входом для взрослых новичков.',
    avatarUrl: '/images/trainers/marina.jpg',
    experienceYears: 9,
    specialties: ['Кроль', 'Дыхание'],
    rating: 4.9,
    reviewCount: 28,
    priceFrom: 1400,
  },
];

const schedule: Schedule[] = [
  {
    id: 21,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Утреннее плавание',
    description: 'Спокойная работа на технику.',
    date: '2026-03-18',
    startTime: '07:30',
    endTime: '08:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 8,
    price: 1100,
    room: 'Бассейн A',
  },
];

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Очень чистый бассейн и спокойная атмосфера.',
  },
];

describe('ClubDetailPageClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  it('рендерит заглушки вместо реальных изображений и публичный контент клуба', () => {
    render(
      <ClubDetailPageClient
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        sports={sports}
        trainers={trainers}
      />,
    );

    expect(screen.getAllByText('Фото клуба').length).toBeGreaterThan(0);
    expect(screen.getByText('Фото тренера')).toBeInTheDocument();
    expect(screen.getByText('Фото автора')).toBeInTheDocument();
    expect(screen.getAllByText('Плавание').length).toBeGreaterThan(0);
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByTestId('club-directions-section')).toBeInTheDocument();
    expect(screen.getByTestId('club-trainers-section')).toBeInTheDocument();
    expect(screen.getByTestId('club-media-gallery')).toBeInTheDocument();
    expect(screen.getByTestId('club-media-gallery-secondary').className).toContain(
      'sm:grid-cols-2',
    );
    expect(screen.getByTestId('club-trainer-card-1')).toHaveClass('flex-col');
  });

  it('для гостя показывает временные auth-подсказки вместо athlete-only действий', async () => {
    vi.useFakeTimers();

    render(
      <ClubDetailPageClient
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        sports={sports}
        trainers={trainers}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Записаться на Утреннее плавание' }));

    expect(
      screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь как спортсмен'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    expect(
      screen.getByText('Чтобы оставить отзыв, войдите или зарегистрируйтесь как спортсмен'),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3200);
    });

    expect(
      screen.queryByText('Чтобы оставить отзыв, войдите или зарегистрируйтесь как спортсмен'),
    ).not.toBeInTheDocument();
  });

  it('для provider блокирует athlete-only действия', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'provider',
      user: {
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    render(
      <ClubDetailPageClient
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        sports={sports}
        trainers={trainers}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Записаться на Утреннее плавание' }));

    expect(
      screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь как спортсмен'),
    ).toBeInTheDocument();
  });

  it('для athlete даёт перейти к записи и отправить отзыв через fake API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 2,
          createdAt: '2026-03-18T10:00:00.000Z',
          userId: 1,
          clubId: 1,
          rating: 5,
          text: 'Очень понравилась спокойная атмосфера.',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <ClubDetailPageClient
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        sports={sports}
        trainers={trainers}
      />,
    );

    expect(screen.getByRole('link', { name: 'Записаться на Утреннее плавание' })).toHaveAttribute(
      'href',
      '/booking/21',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Оценить на 5 из 5' }));
    fireEvent.change(screen.getByLabelText('Отзыв'), {
      target: { value: 'Очень понравилась спокойная атмосфера.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reviews',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(screen.getByText('Очень понравилась спокойная атмосфера.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Отзыв отправлен.')).toBeInTheDocument();
    });
  });

  it('содержит slug-ссылку на страницу тренера в секции тренеров', () => {
    render(
      <ClubDetailPageClient
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        sports={sports}
        trainers={trainers}
      />,
    );

    expect(screen.getByRole('link', { name: 'Марина Соколова' })).toHaveAttribute(
      'href',
      '/trainers/marina-sokolova',
    );
  });
});
