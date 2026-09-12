// Тесты отображения города в профиле. Step 19.8 изначально проверял монолиты
// AthleteProfilePage/ProviderProfilePage — в Phase 26 Step 26.5 монолиты удалены,
// тест переписан на AthleteDashboard/ProviderDashboard, которые теперь
// отображают город пользователя в шапке через testid'ы.
import { render, screen } from '@testing-library/react';
import { clubFace, renderInFaceCabinet } from '@/test/helpers/cabinet';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/useAuthStore';
import { facesOf } from '@/test/helpers/service-faces';

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

import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';
import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import type { Club } from '@sporthub/types';

const baseUser = {
  id: 1,
  name: 'Тестовый Пользователь',
  email: 'test@example.com',
  phone: '+7 (999) 123-45-67',
};

// Dummy-клуб чтобы ProviderDashboard не падал в empty-state и рендерил шапку с
// мета-инфо (ID + city). Для теста city содержимое клуба неважно.
const providerClub: Club = {
  id: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Test Club',
  slug: 'test-club',
  description: 'Test',
  shortDescription: '',
  phone: '',
  imageUrls: [],
  distanceKm: 0,
  sportIds: [1],
  rating: 0,
  reviewCount: 0,
  city: 'Москва',
  address: '',
  coordinates: { lat: 0, lng: 0 },
  tagIds: [],
  amenityIds: [],
  priceFrom: 0,
  managedByUserId: 1,
};

describe('Город в профиле (Step 19.8 → Phase 26 Step 26.5)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { ...baseUser, city: 'Самара' },
      accountKind: 'person',
      isAdmin: false,
      isImpersonating: false,
    });
  });

  describe('Dashboard спортсмена', () => {
    it('отображает город из профиля с припиской «г.»', () => {
      render(<AthleteDashboard />);

      expect(screen.getByTestId('athlete-dashboard-city')).toHaveTextContent('г. Самара');
    });

    it('показывает «не указан» если город отсутствует', () => {
      useAuthStore.setState({ user: { ...baseUser, city: undefined } });

      render(<AthleteDashboard />);

      expect(screen.getByTestId('athlete-dashboard-city')).toHaveTextContent('не указан');
    });
  });

  describe('Dashboard провайдера', () => {
    beforeEach(() => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: { ...baseUser, city: 'Москва' },
        accountKind: 'person',
        isAdmin: false,
        isImpersonating: false,
        // ⚠️ Шаг 35.20a. Кабинет лица отбирает свои публикации по ЛИЦАМ
        // из ответа «кто я»: номер владельца из каталога ушёл. Без лица
        // сводка ушла бы в пустой вид, где шапки с городом нет.
        faces: facesOf({ userId: baseUser.id, clubs: [providerClub] }),
      });
    });

    // ⚠️ Кабинет — клуба 10, номер взят у `providerClub`. Умолчание помощника (клуб 1)
    // этому набору не подходит: раздел не нашёл бы своё лицо и ушёл бы в пустой вид,
    // где шапки с городом нет вовсе.
    it('отображает город из профиля с припиской «г.»', () => {
      renderInFaceCabinet(
        <ProviderDashboard clubs={[providerClub]} />,
        clubFace(providerClub.id, providerClub.name),
      );

      expect(screen.getByTestId('provider-dashboard-city')).toHaveTextContent('г. Москва');
    });

    it('показывает «не указан» если город отсутствует', () => {
      useAuthStore.setState({
        user: { ...baseUser, city: undefined },
        accountKind: 'person',
        faces: facesOf({ userId: baseUser.id, clubs: [providerClub] }),
      });

      // Тот же кабинет клуба 10 — город берётся из профиля человека, а не из лица.
      renderInFaceCabinet(
        <ProviderDashboard clubs={[providerClub]} />,
        clubFace(providerClub.id, providerClub.name),
      );

      expect(screen.getByTestId('provider-dashboard-city')).toHaveTextContent('не указан');
    });
  });
});
