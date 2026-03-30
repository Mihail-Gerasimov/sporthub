// Тесты секции «Мои публикации» провайдер-кабинета (Step 12.5 / Step 14.7)
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProviderPublicationsSection } from '@/components/profile/ProviderPublicationsSection';
import type { Club, Trainer } from '@/types';

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna',
    description: '',
    shortDescription: '',
    city: 'Самара',
    address: '',
    phone: '',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [3],
    imageUrls: [],
    amenities: [],
    tags: [],
    rating: 4.8,
    reviewCount: 10,
    priceFrom: 900,
    distanceKm: 1.8,
    isFeatured: true,
    managedByUserId: 2,
  },
];

const trainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Марина Соколова',
    slug: 'marina',
    bio: '',
    avatarUrl: '',
    experienceYears: 9,
    specialties: [],
    rating: 4.9,
    reviewCount: 3,
    priceFrom: 1400,
    sportIds: [3],
    managedByUserId: 2,
  },
];

describe('ProviderPublicationsSection', () => {
  it('рендерит карточки клубов и тренеров с типом и рейтингом', () => {
    render(<ProviderPublicationsSection clubs={clubs} trainers={trainers} />);

    // Заголовок секции
    expect(screen.getByText('Мои публикации')).toBeInTheDocument();

    // Клуб
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Клуб')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText(/10 отзыв/)).toBeInTheDocument();

    // Тренер
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByText('Тренер')).toBeInTheDocument();
    expect(screen.getByText('4.9')).toBeInTheDocument();
    expect(screen.getByText(/3 отзыв/)).toBeInTheDocument();
  });

  it('рендерит ссылки на детальные страницы', () => {
    render(<ProviderPublicationsSection clubs={clubs} trainers={trainers} />);

    const clubLink = screen.getByRole('link', { name: /Volna Aquatic Club/ });
    const trainerLink = screen.getByRole('link', { name: /Марина Соколова/ });

    expect(clubLink).toHaveAttribute('href', '/clubs/volna');
    expect(trainerLink).toHaveAttribute('href', '/trainers/marina');
  });

  it('показывает пустое состояние при отсутствии публикаций', () => {
    render(<ProviderPublicationsSection clubs={[]} trainers={[]} />);

    expect(screen.getByTestId('provider-publications-empty')).toHaveTextContent(
      'У вас пока нет публикаций',
    );
  });

  it('после появления нового клуба в props сразу рендерит карточку публикации', () => {
    const { rerender } = render(<ProviderPublicationsSection clubs={[]} trainers={[]} />);

    expect(screen.getByTestId('provider-publications-empty')).toBeInTheDocument();

    rerender(<ProviderPublicationsSection clubs={clubs} trainers={[]} />);

    expect(screen.getByTestId('provider-publications-list')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
  });

  it('после появления нового тренера в props сразу рендерит карточку публикации', () => {
    const { rerender } = render(<ProviderPublicationsSection clubs={[]} trainers={[]} />);

    expect(screen.getByTestId('provider-publications-empty')).toBeInTheDocument();

    rerender(<ProviderPublicationsSection clubs={[]} trainers={trainers} />);

    expect(screen.getByTestId('provider-publications-list')).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
  });

  it('корректно работает с только клубами', () => {
    render(<ProviderPublicationsSection clubs={clubs} trainers={[]} />);

    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.queryByText('Марина Соколова')).not.toBeInTheDocument();
  });

  it('корректно работает с только тренерами', () => {
    render(<ProviderPublicationsSection clubs={[]} trainers={trainers} />);

    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();
  });
});
