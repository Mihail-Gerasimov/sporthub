import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubCard } from '@/components/clubs/ClubCard';
import type { Club, Sport } from '@/types';

const sports: Pick<Sport, 'id' | 'name' | 'icon'>[] = [
  { id: 3, name: 'Плавание', icon: '🏊' },
  { id: 8, name: 'Пилатес', icon: '🤸' },
];

const club: Club = {
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
  isFeatured: true,
};

describe('ClubCard', () => {
  it('сохраняет компактную плашку фото даже при выделении карточки на карте', () => {
    render(<ClubCard club={club} highlighted sports={sports} />);

    const mediaPreviewPill = screen.getByTestId('club-card-media-pill');

    expect(screen.getByText('Выбрано на карте')).toBeInTheDocument();
    expect(mediaPreviewPill.className).toContain('whitespace-nowrap');
    expect(mediaPreviewPill.className).toContain('shrink-0');
  });
});
