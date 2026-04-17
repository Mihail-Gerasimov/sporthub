// Тест поиска клубов по именам тегов — filterClubs резолвит tagIds → names (Step 23.10)
import { describe, expect, it } from 'vitest';

import { filterClubs } from '@/components/clubs/filterClubs';
import type { Club, Tag } from '@/types';

const tags: Tag[] = [
  { id: 1, name: 'Бассейн', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, name: 'Групповые', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 3, name: 'Детские секции', createdAt: '2026-01-01T00:00:00.000Z' },
];

const sports = [{ id: 3, name: 'Плавание', icon: '🏊' }];

const club: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном',
  shortDescription: 'Бассейн рядом.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  email: '',
  website: '',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  sportIds: [3],
  imageUrls: [],
  amenityIds: [],
  tagIds: [1, 3],
  rating: 4.8,
  reviewCount: 64,
  priceFrom: 900,
  distanceKm: 1.8,
  isFeatured: false,
};

describe('filterClubs — поиск ��о имени тега (Step 23.10)', () => {
  it('находит клуб при поиске по имени тега "бассейн"', () => {
    const result = filterClubs({
      clubs: [club],
      searchQuery: 'бассейн',
      selectedSportId: null,
      sports,
      tags,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('находит клуб при поиске по имени тега "детские"', () => {
    const result = filterClubs({
      clubs: [club],
      searchQuery: 'детские',
      selectedSportId: null,
      sports,
      tags,
    });

    expect(result).toHaveLength(1);
  });

  it('НЕ находит клуб при поиске по имени тега, которого нет у клуба', () => {
    const result = filterClubs({
      clubs: [club],
      searchQuery: 'групповые',
      selectedSportId: null,
      sports,
      tags,
    });

    // club.tagIds = [1, 3] → "Бассейн", "Детс��ие секции" — "Гр��пповые" (id=2) отсутствует
    expect(result).toHaveLength(0);
  });

  it('работает без справочника тегов (graceful fallback)', () => {
    const result = filterClubs({
      clubs: [club],
      searchQuery: 'volna',
      selectedSportId: null,
      sports,
    });

    expect(result).toHaveLength(1);
  });
});
