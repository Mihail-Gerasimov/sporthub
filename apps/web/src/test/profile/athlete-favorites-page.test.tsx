// ⚠️ Фаза 35, шаг 35.34. Проверка «чужому — плашка «Доступ ограничен»» снята
// не потому, что стала не нужна, а потому, что она никогда не была защитой:
// плашка рисовалась ПОВЕРХ уже отданных данных. Настоящая проверка стоит
// в серверном лейауте, ДО похода за данными, и проверяется она набором
// `src/test/security/protected-layouts.test.ts` — там же, где проверяется
// и то, что уведённому данные не запрашивались вообще.
// Тесты клиентской обёртки Athlete Favorites (Step 25.6): wrapper передаёт авторизованный
// userId через useAuthStore → getAthleteFavorites, рендерит существующий AthleteFavoritesSection
// без модификаций. Server page /profile/athlete/favorites — тривиальный fetcher; покрыт через обёртку.
import { render, screen } from '@testing-library/react';
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

import { AthleteFavorites } from '@/components/profile/athlete/AthleteFavorites';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Review, User } from '@sporthub/types';

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей Миронов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  passwordHash: 'secret',
  favoriteClubIds: [1],
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

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-02-01T00:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Отличный клуб.',
  },
];

describe('AthleteFavorites (Step 25.6)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('для авторизованного атлета рендерит секцию избранного с реальными клубами', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: athleteUser,
      accountKind: 'person',
      isAuthenticated: true,
    });

    render(
      <AthleteFavorites
        clubs={clubs}
        reviews={reviews}
        bookings={[]}
        trainers={[]}
        users={[athleteUser]}
      />,
    );

    expect(screen.getByTestId('athlete-favorites-section')).toBeInTheDocument();
    expect(screen.getByText('Aqua Pro')).toBeInTheDocument();
  });
});
