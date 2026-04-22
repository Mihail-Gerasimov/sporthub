// Тесты клиентской обёртки Athlete Reviews (Step 25.6): wrapper фильтрует reviews по
// авторизованному athleteUserId через useAuthStore, резолвит targetName через
// getAthleteReviewItems и рендерит новый AthleteReviewsSection. Server page тривиальный.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { AthleteReviews } from '@/components/profile/athlete/AthleteReviews';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Review, Trainer, User } from '@/types';

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  name: 'Алексей Миронов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  password: 'secret',
  favoriteClubIds: [],
};

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Aqua Pro',
    slug: 'aqua-pro',
    description: 'Центр плавания',
    sportId: 3,
    sportIds: [3],
    rating: 4.8,
    reviewCount: 10,
    city: 'Самара',
    address: 'ул. Центральная, 1',
    coordinates: { lat: 53.2, lng: 50.1 },
    tagIds: [],
    amenityIds: [],
    priceFrom: 1000,
  },
];

const trainers: Trainer[] = [];

describe('AthleteReviews (Step 25.6)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: athleteUser,
      accountType: 'athlete',
      isAuthenticated: true,
    });
  });

  it('рендерит список отзывов авторизованного атлета с targetName клуба', () => {
    const reviews: Review[] = [
      {
        id: 1,
        createdAt: '2026-02-15T12:00:00.000Z',
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Отличный клуб.',
      },
    ];

    render(<AthleteReviews clubs={clubs} trainers={trainers} reviews={reviews} />);

    expect(screen.getByTestId('athlete-reviews-section')).toBeInTheDocument();
    expect(screen.getByText('Aqua Pro')).toBeInTheDocument();
    expect(screen.getByText('Отличный клуб.')).toBeInTheDocument();
  });

  it('empty state при отсутствии отзывов атлета', () => {
    render(<AthleteReviews clubs={clubs} trainers={trainers} reviews={[]} />);

    expect(screen.getByTestId('athlete-reviews-section')).toBeInTheDocument();
    expect(screen.getByText(/ещё не оставлял отзывы/i)).toBeInTheDocument();
  });

  // Phase 26 Step 26.5: перенос pagination-кейса из удалённого
  // athlete-profile-page.test.tsx. AthleteReviewsSection показывает первые 3
  // отзыва сразу, остальные — по клику «Показать все отзывы».
  it('раскрывает и сворачивает список отзывов через кнопку «Показать все отзывы»', () => {
    // 4 отзыва — больше лимита 3, значит кнопка должна появиться.
    const reviews: Review[] = [
      {
        id: 1,
        createdAt: '2026-02-15T12:00:00.000Z',
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Отзыв 1',
      },
      {
        id: 2,
        createdAt: '2026-02-14T12:00:00.000Z',
        userId: 1,
        clubId: 1,
        rating: 4,
        text: 'Отзыв 2',
      },
      {
        id: 3,
        createdAt: '2026-02-13T12:00:00.000Z',
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Отзыв 3',
      },
      {
        id: 4,
        createdAt: '2026-02-12T12:00:00.000Z',
        userId: 1,
        clubId: 1,
        rating: 4,
        text: 'Отзыв 4',
      },
    ];

    render(<AthleteReviews clubs={clubs} trainers={trainers} reviews={reviews} />);

    // По умолчанию 4-й отзыв скрыт за pagination.
    expect(screen.queryByText('Отзыв 4')).not.toBeInTheDocument();

    // Клик «Показать все отзывы» → 4-й становится видим.
    const expandButton = screen.getByRole('button', { name: /Показать все отзывы/i });
    fireEvent.click(expandButton);
    expect(screen.getByText('Отзыв 4')).toBeInTheDocument();

    // Клик «Скрыть отзывы» → снова скрыт.
    const collapseButton = screen.getByRole('button', { name: /Скрыть отзывы/i });
    fireEvent.click(collapseButton);
    expect(screen.queryByText('Отзыв 4')).not.toBeInTheDocument();
  });
});
