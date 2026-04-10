// Тесты отображения города в профиле (Step 19.8)
// Покрывают: город в ЛК спортсмена и провайдера, fallback при отсутствии города
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/useAuthStore';

/* --- Мокаем next/navigation --- */
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  notFound: () => {
    throw new Error('Not found');
  },
}));

/* --- Импорт компонентов --- */
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';
import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';

/* --- Фикстуры --- */
const baseUser = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Тестовый Пользователь',
  email: 'test@example.com',
  phone: '+7 (999) 123-45-67',
  role: 'athlete' as const,
  status: 'active' as const,
  favoriteClubIds: [],
};

describe('Город в профиле (Step 19.8)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { ...baseUser, city: 'Самара' },
      accountType: 'athlete',
      isAdmin: false,
      isImpersonating: false,
    });
  });

  describe('ЛК спортсмена', () => {
    it('отображает город из профиля с припиской «г.»', () => {
      render(<AthleteProfilePage />);

      expect(screen.getByText('Город')).toBeInTheDocument();
      expect(screen.getByText('г. Самара')).toBeInTheDocument();
    });

    it('показывает «не указан» если город отсутствует', () => {
      useAuthStore.setState({
        user: { ...baseUser, city: undefined },
      });

      render(<AthleteProfilePage />);

      expect(screen.getByText('не указан')).toBeInTheDocument();
    });
  });

  describe('ЛК провайдера', () => {
    beforeEach(() => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: { ...baseUser, city: 'Москва' },
        accountType: 'provider',
        isAdmin: false,
        isImpersonating: false,
      });
    });

    it('отображает город из профиля с припиской «г.»', () => {
      render(<ProviderProfilePage />);

      expect(screen.getByText('Город')).toBeInTheDocument();
      expect(screen.getByText('г. Москва')).toBeInTheDocument();
    });

    it('показывает «не указан» если город отсутствует', () => {
      useAuthStore.setState({
        user: { ...baseUser, city: undefined },
        accountType: 'provider',
      });

      render(<ProviderProfilePage />);

      expect(screen.getByText('не указан')).toBeInTheDocument();
    });
  });
});
