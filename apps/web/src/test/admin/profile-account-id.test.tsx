/**
 * Тесты отображения ID аккаунта в ЛК (Step 17.6 → Phase 26 Step 26.5).
 * Исторически проверял монолиты AthleteProfilePage/ProviderProfilePage. После
 * удаления монолитов в Step 26.5 переписан на Dashboard'ы обеих ролей —
 * AthleteDashboard и ProviderDashboard теперь отображают ID в шапке через
 * data-testid="athlete-dashboard-account-id" / "provider-dashboard-account-id".
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';
import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

// Номера пользователей стенда. Раньше они приезжали константами из стора —
// фронт знал наперёд, кто атлет, провайдер и администратор. Теперь это просто
// данные теста.
const ATHLETE_USER_ID = 1;
const PROVIDER_USER_ID = 2;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('ID аккаунта в ЛК (Step 17.6 → Phase 26 Step 26.5)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('ID аккаунта отображается в шапке AthleteDashboard', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
      accountType: 'athlete',
      isAuthenticated: true,
    });

    render(<AthleteDashboard bookings={[]} clubs={[]} schedule={[]} trainers={[]} />);

    expect(screen.getByTestId('athlete-dashboard-account-id')).toHaveTextContent(
      `ID: #${ATHLETE_USER_ID}`,
    );
  });

  it('ID аккаунта отображается в шапке ProviderDashboard', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: {
        id: PROVIDER_USER_ID,
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
      accountType: 'provider',
      isAuthenticated: true,
    });

    // Dummy-клуб под `managedByUserId = PROVIDER_USER_ID`, чтобы Dashboard
    // не уходил в empty-state (там шапки с ID нет) и рендерил мета-инфо.
    render(
      <ProviderDashboard
        bookings={[]}
        clubs={[
          {
            id: 10,
            createdAt: '2026-01-01T00:00:00.000Z',
            name: 'Test',
            slug: 'test',
            description: '',
            sportId: 1,
            sportIds: [1],
            rating: 0,
            reviewCount: 0,
            city: '',
            address: '',
            coordinates: { lat: 0, lng: 0 },
            tagIds: [],
            amenityIds: [],
            priceFrom: 0,
            managedByUserId: PROVIDER_USER_ID,
          },
        ]}
        trainers={[]}
        offerings={[]}
        schedule={[]}
        links={[]}
        notifications={[]}
      />,
    );

    expect(screen.getByTestId('provider-dashboard-account-id')).toHaveTextContent(
      `ID: #${PROVIDER_USER_ID}`,
    );
  });
});
