// Тесты клиентской обёртки Athlete Settings (Step 25.6): wrapper пропускает авторизованного
// атлета в существующий AthleteFeedbackSettingsSection, иначе показывает access-denied.
// Блок уведомлений (checkbox per NotificationType) появится в Step 25.14.
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

import { AthleteSettings } from '@/components/profile/athlete/AthleteSettings';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Review, Trainer, User } from '@sporthub/types';

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

const providerUser: User = {
  id: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'club_owner',
  name: 'Сергей Иванов',
  email: 'sergey@sporthub.local',
  phone: '+7 999 222-33-44',
  password: 'secret',
  favoriteClubIds: [],
};

const clubs: Club[] = [];
const trainers: Trainer[] = [];
const reviews: Review[] = [];

describe('AthleteSettings (Step 25.6)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('для авторизованного атлета рендерит Feedback Settings с email', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: athleteUser,
      accountType: 'athlete',
      isAuthenticated: true,
    });

    render(<AthleteSettings clubs={clubs} trainers={trainers} reviews={reviews} />);

    expect(screen.getByTestId('athlete-feedback-settings-section')).toBeInTheDocument();
    // Phase 29 Step 29.6: email теперь дублируется в AccountCredentialsSection (read-only)
    // и в AthleteFeedbackSettingsSection — допустимо, проверяем что хотя бы один элемент есть.
    expect(screen.getAllByText('alexey@sporthub.local').length).toBeGreaterThan(0);
  });

  it('для provider-сессии показывает access-denied', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: providerUser,
      accountType: 'provider',
      isAuthenticated: true,
    });

    render(<AthleteSettings clubs={clubs} trainers={trainers} reviews={reviews} />);

    expect(screen.queryByTestId('athlete-feedback-settings-section')).not.toBeInTheDocument();
    expect(screen.getByText(/Доступ ограничен/i)).toBeInTheDocument();
  });
});
