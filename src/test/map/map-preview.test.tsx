import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { MapPreviewSection } from '@/components/map/MapPreviewSection';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, Sport } from '@/types';

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
    amenities: ['Бассейн 25 м'],
    tags: ['Бассейн', 'Восстановление', 'Утренние группы'],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 900,
    distanceKm: 1.8,
    isFeatured: true,
  },
  {
    id: 3,
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
    amenities: ['Коврики и блоки'],
    tags: ['Йога', 'Пилатес', 'Спокойный формат'],
    rating: 4.9,
    reviewCount: 72,
    priceFrom: 850,
    distanceKm: 2.3,
    isFeatured: true,
  },
];

describe('MapPreviewSection', () => {
  beforeEach(() => {
    useFilterStore.setState({
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('рендерит метки карты и по клику подсвечивает связанную карточку клуба', () => {
    render(<MapPreviewSection clubs={clubs} sports={sports} />);

    expect(screen.getByTestId('main-zone-layout').className).toContain('flex');
    expect(screen.getByTestId('main-zone-layout').className).toContain('flex-col');
    expect(screen.getByRole('button', { name: 'Скрыть карту' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    const volnaMarker = screen.getByRole('button', {
      name: 'Выбрать клуб Volna Aquatic Club на карте',
    });
    const balanceMarker = screen.getByRole('button', {
      name: 'Выбрать клуб Balance Yoga House на карте',
    });

    expect(volnaMarker).toHaveAttribute('data-marker-size', 'compact');
    expect(balanceMarker).toHaveAttribute('data-marker-size', 'compact');
    expect(volnaMarker).toBeInTheDocument();
    expect(balanceMarker).toBeInTheDocument();

    fireEvent.click(balanceMarker);

    expect(screen.getByText('выбран клуб: Balance Yoga House')).toBeInTheDocument();
    expect(screen.getAllByText('Выбрано на карте')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Скрыть карту' }));

    expect(screen.getByRole('button', { name: 'Показать карту' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByTestId('map-panel')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByTestId('list-panel')).toBeInTheDocument();
  });
});
