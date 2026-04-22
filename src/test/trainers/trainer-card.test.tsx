import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrainerCard } from '@/components/trainers/TrainerCard';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

/* Минимальный моковый тренер для карточки */
const trainer: TrainerDirectoryItem = {
  id: 1,
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию.',
  avatarUrl: '/images/trainers/marina.jpg',
  experienceYears: 9,
  specialtyIds: [1],
  specialtyNames: ['Подготовка к соревнованиям'],
  rating: 4.9,
  reviewCount: 28,
  priceFrom: 1400,
  sportIds: [3],
  sports: [{ id: 3, name: 'Плавание', icon: '🏊' }],
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  distanceKm: 1.8,
  venueName: 'Volna Aquatic Club',
  venueLabel: 'Volna Aquatic Club',
  venueAddress: 'ул. Лесная, 23к1',
  primaryOfferingId: 101,
  primaryOfferingTitle: 'Персональная тренировка',
  primaryOfferingFormat: 'personal',
  nextSlotId: 1,
  nextSlotDate: '2026-03-18',
  nextSlotStartTime: '07:30',
  availableSlotsCount: 5,
  offeringTitles: ['Персональная тренировка'],
  searchText: 'марина соколова плавание volna aquatic club',
};

describe('TrainerCard', () => {
  it('содержит ссылку на детальную страницу тренера /trainers/[slug]', () => {
    render(<TrainerCard trainer={trainer} />);

    const nameLink = screen.getByRole('link', { name: 'Марина Соколова' });

    expect(nameLink).toHaveAttribute('href', '/trainers/marina-sokolova');
  });

  it('содержит ссылку на booking по ближайшему слоту', () => {
    render(<TrainerCard trainer={trainer} />);

    expect(screen.getByRole('link', { name: 'Перейти к записи' })).toHaveAttribute(
      'href',
      '/booking/1',
    );
  });

  it('отображает имена специализаций вместо id (Step 23.10)', () => {
    const trainerWithNames: TrainerDirectoryItem = {
      ...trainer,
      specialtyIds: [1, 2],
      specialtyNames: ['Подготовка к соревнованиям', 'Реабилитация'],
    };
    render(<TrainerCard trainer={trainerWithNames} />);

    expect(screen.getByText('Подготовка к соревнованиям')).toBeInTheDocument();
    expect(screen.getByText('Реабилитация')).toBeInTheDocument();
  });

  // Phase 25 Step 25.13: публичная симметрия репутации.
  it('рендерит danger-бейдж при reliability.badge=danger', () => {
    render(
      <TrainerCard
        trainer={trainer}
        reliability={{
          totalRelevant: 10,
          completedCount: 6,
          noShowCount: 4,
          lateCancelCount: 0,
          rejectedByProviderCount: 0,
          completionRate: 0.6,
          badge: 'danger',
          isNewUser: false,
        }}
      />,
    );

    expect(screen.getByTestId('reliability-badge-danger')).toBeInTheDocument();
  });

  it('не рендерит ReliabilityBadge если reliability не передан', () => {
    render(<TrainerCard trainer={trainer} />);
    expect(screen.queryByTestId('reliability-badge-danger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reliability-badge-warning')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reliability-badge-new')).not.toBeInTheDocument();
  });

  it('рендерит «Новый» для isNewUser=true', () => {
    render(
      <TrainerCard
        trainer={trainer}
        reliability={{
          totalRelevant: 1,
          completedCount: 1,
          noShowCount: 0,
          lateCancelCount: 0,
          rejectedByProviderCount: 0,
          completionRate: 1,
          badge: null,
          isNewUser: true,
        }}
      />,
    );
    expect(screen.getByTestId('reliability-badge-new')).toBeInTheDocument();
  });
});
