import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainerDetailPageClient } from '@/components/trainers/TrainerDetailPageClient';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Offering, Review, Schedule, Sport, Trainer } from '@/types';

/* Моковые данные тренера */
const trainer: Trainer = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию с мягким входом для взрослых новичков.',
  avatarUrl: '/images/trainers/marina.jpg',
  experienceYears: 9,
  specialties: ['Кроль', 'Дыхание'],
  rating: 4.9,
  reviewCount: 28,
  priceFrom: 1400,
  sportIds: [3],
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
};

const sports: Sport[] = [
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Плавание',
    slug: 'swimming',
    description: 'Плавание в бассейне.',
    icon: '🏊',
    imageUrl: '/images/sports/swimming.jpg',
    isPopular: true,
  },
];

const affiliatedClub: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном.',
  shortDescription: 'Бассейн и пилатес.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  sportIds: [3],
  imageUrls: [],
  amenities: [],
  tags: [],
  rating: 4.8,
  reviewCount: 64,
  priceFrom: 900,
  distanceKm: 1.8,
  isFeatured: true,
};

const offerings: Offering[] = [
  {
    id: 101,
    createdAt: '2026-03-17T09:00:00.000Z',
    ownerType: 'trainer',
    ownerId: 1,
    affiliatedClubId: 1,
    sportId: 3,
    title: 'Персональная тренировка: Плавание',
    description: 'Индивидуальная работа над техникой.',
    format: 'personal',
    price: 1400,
    durationMinutes: 60,
    capacity: 1,
    address: 'ул. Лесная, 23к1',
    coordinates: { lat: 53.2129, lng: 50.1245 },
  },
];

const schedule: Schedule[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Утреннее плавание',
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
    trainerId: 1,
    rating: 5,
    text: 'Отличный тренер, очень внимательная.',
  },
];

const reviewAuthors: Record<number, string> = { 1: 'Алексей Смирнов' };

/* Пропсы по умолчанию для всех тестов */
const defaultProps = {
  affiliatedClub,
  offerings,
  reviewAuthors,
  reviews,
  schedule,
  sports,
  trainer,
};

describe('TrainerDetailPageClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит имя тренера, bio, специализации и виды спорта', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
    expect(
      screen.getByText('Тренер по плаванию с мягким входом для взрослых новичков.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Кроль')).toBeInTheDocument();
    expect(screen.getByText('Дыхание')).toBeInTheDocument();
    expect(screen.getAllByText('Плавание').length).toBeGreaterThan(0);
  });

  it('рендерит секцию связанного клуба с ссылкой', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByTestId('trainer-affiliated-club-section')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти к клубу' })).toHaveAttribute(
      'href',
      '/clubs/volna-aquatic-club',
    );
  });

  it('не рендерит секцию связанного клуба если клуба нет', () => {
    render(<TrainerDetailPageClient {...defaultProps} affiliatedClub={null} />);

    expect(screen.queryByTestId('trainer-affiliated-club-section')).not.toBeInTheDocument();
  });

  it('рендерит услуги тренера', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByTestId('trainer-offerings-section')).toBeInTheDocument();
    expect(screen.getByText('Персональная тренировка: Плавание')).toBeInTheDocument();
    expect(screen.getByText('Персонально')).toBeInTheDocument();
    expect(screen.getByText('60 мин')).toBeInTheDocument();
  });

  it('рендерит расписание с группировкой по дням', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByTestId('trainer-schedule-section')).toBeInTheDocument();
    expect(screen.getByText('Утреннее плавание')).toBeInTheDocument();
    expect(screen.getByText('07:30 - 08:30')).toBeInTheDocument();
    expect(screen.getByText('Бассейн A')).toBeInTheDocument();
  });

  it('для гостя показывает кнопку «Записаться» и auth-notice при клике', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Записаться на Утреннее плавание' }));

    expect(
      screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь как спортсмен'),
    ).toBeInTheDocument();
  });

  it('для athlete показывает ссылку «Записаться» на booking', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByRole('link', { name: 'Записаться на Утреннее плавание' })).toHaveAttribute(
      'href',
      '/booking/1',
    );
  });

  it('рендерит отзывы с именем автора', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('Отличный тренер, очень внимательная.')).toBeInTheDocument();
    expect(screen.getByText('Фото автора')).toBeInTheDocument();
  });

  it('для гостя блокирует отправку отзыва с auth-notice', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    expect(
      screen.getByText('Чтобы оставить отзыв, войдите или зарегистрируйтесь как спортсмен'),
    ).toBeInTheDocument();
  });

  it('для athlete отправляет отзыв через API с trainerId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 2,
          createdAt: '2026-03-18T10:00:00.000Z',
          userId: 1,
          trainerId: 1,
          rating: 5,
          text: 'Замечательные тренировки!',
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

    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Оценить на 5 из 5' }));
    fireEvent.change(screen.getByLabelText('Отзыв'), {
      target: { value: 'Замечательные тренировки!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    /* Проверяем что POST содержит trainerId */
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(callBody).toEqual(
      expect.objectContaining({
        trainerId: 1,
        rating: 5,
        text: 'Замечательные тренировки!',
      }),
    );
    expect(screen.getByText('Замечательные тренировки!')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Отзыв отправлен.')).toBeInTheDocument();
    });
  });

  it('показывает ошибки валидации при пустой форме', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: { id: 1, name: 'Тест', email: 'test@test.local' },
    });

    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    expect(screen.getByText('Выбери оценку.')).toBeInTheDocument();
    expect(screen.getByText('Напиши пару слов о впечатлении.')).toBeInTheDocument();
  });
});
