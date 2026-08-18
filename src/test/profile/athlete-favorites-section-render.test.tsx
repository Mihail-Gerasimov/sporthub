// Тест рендера AthleteFavoritesSection — specialtyIds → имена через справочник (Step 23.10)
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AthleteFavoritesSection } from '@/components/profile/AthleteFavoritesSection';
import type { AthleteFavoriteTrainer } from '@/components/profile/athlete-favorites';
import type { Specialty } from '@sporthub/types';

const specialties: Specialty[] = [
  { id: 1, name: 'Подготовка к соревнованиям', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, name: 'Реабилитация', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 3, name: 'Детский тренер', createdAt: '2026-01-01T00:00:00.000Z' },
];

const trainer: AthleteFavoriteTrainer = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию.',
  avatarUrl: '',
  experienceYears: 9,
  sportId: 3,
  sportIds: [3],
  specialtyIds: [1, 3],
  workFormatIds: [1],
  priceFrom: 1400,
  rating: 4.9,
  reviewCount: 28,
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  reasonLabel: 'Есть записи к тренеру',
};

describe('AthleteFavoritesSection — specialtyNames (Step 23.10)', () => {
  it('отображает имена специализаций через справочник, а не голые id', () => {
    render(
      <AthleteFavoritesSection
        favoriteClubs={[]}
        favoriteTrainers={[trainer]}
        specialties={specialties}
      />,
    );

    expect(screen.getByText('Подготовка к соревнованиям · Детский тренер')).toBeInTheDocument();
  });

  it('работает без справочника (graceful fallback — id)', () => {
    render(<AthleteFavoritesSection favoriteClubs={[]} favoriteTrainers={[trainer]} />);

    // Без справочник�� — показывает #id fallback
    expect(screen.getByText('#1 · #3')).toBeInTheDocument();
  });
});
