import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClubList } from '@/components/clubs/ClubList';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, Sport } from '@sporthub/types';

const sports: Pick<Sport, 'id' | 'name' | 'icon'>[] = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 3, name: 'Плавание', icon: '🏊' },
  { id: 8, name: 'Пилатес', icon: '🤸' },
];

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna-aquatic-club',
    description: 'Клуб с бассейном и пилатесом',
    shortDescription: 'Бассейн и пилатес рядом с набережной.',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    phone: '+7 (846) 200-11-01',
    email: 'hello@volna-club.ru',
    website: 'https://volna-club.ru',
    coordinates: { lat: 53.2129, lng: 50.1245 },
    sportIds: [3, 8],
    imageUrls: ['/images/clubs/volna-1.jpg'],
    amenityIds: [1],
    tagIds: [1, 2, 3],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 900,
    distanceKm: 1.8,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Balance Yoga House',
    slug: 'balance-yoga-house',
    description: 'Камерная студия для йоги и пилатеса',
    shortDescription: 'Йога и пилатес в центре города.',
    city: 'Самара',
    address: 'ул. Молодогвардейская, 86',
    phone: '+7 (846) 200-11-03',
    email: 'hello@balance-house.ru',
    website: 'https://balance-house.ru',
    coordinates: { lat: 53.1957, lng: 50.1006 },
    sportIds: [1, 8],
    imageUrls: ['/images/clubs/balance-1.jpg'],
    amenityIds: [1],
    tagIds: [1, 2, 3],
    rating: 4.9,
    reviewCount: 72,
    priceFrom: 850,
    distanceKm: 2.3,
  },
];

describe('ClubList', () => {
  beforeEach(() => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('рендерит карточки клубов со slug-ссылками на detail page', () => {
    render(<ClubList clubs={clubs} sports={sports} />);

    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Balance Yoga House')).toBeInTheDocument();

    const clubLink = screen.getByRole('link', { name: /Balance Yoga House/i });

    expect(clubLink).toHaveAttribute('href', '/clubs/balance-yoga-house');
  });

  it('фильтрует список по searchQuery из store', () => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: 'volna',
      selectedSportId: null,
    });

    render(<ClubList clubs={clubs} sports={sports} />);

    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.queryByText('Balance Yoga House')).not.toBeInTheDocument();
  });

  it('фильтрует список по выбранному sportId из store', () => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: 1,
    });

    render(<ClubList clubs={clubs} sports={sports} />);

    expect(screen.getByText('Balance Yoga House')).toBeInTheDocument();
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();
  });
});
