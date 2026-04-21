// Тесты data-driven навигации ЛК (Step 25.2): пункты зависят от наличия публикаций и bookings.
import { describe, expect, it } from 'vitest';

import type { Club, Trainer } from '@/types';
import { getAthleteNavItems, getProviderNavItems } from '@/components/profile/profile-nav-items';

const mockClub: Club = {
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
  amenityIds: [],
  tagIds: [],
  rating: 4.8,
  reviewCount: 10,
  priceFrom: 900,
  distanceKm: 1.8,
  isFeatured: true,
  managedByUserId: 2,
};

const mockTrainer: Trainer = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina',
  bio: '',
  avatarUrl: '',
  experienceYears: 9,
  specialtyIds: [],
  workFormatIds: [1],
  rating: 4.9,
  reviewCount: 3,
  priceFrom: 1400,
  sportIds: [3],
  managedByUserId: 2,
};

describe('getAthleteNavItems', () => {
  it('возвращает 7 стандартных разделов атлета в стабильном порядке', () => {
    const items = getAthleteNavItems();

    expect(items.map((item) => item.key)).toEqual([
      'dashboard',
      'schedule',
      'stats',
      'favorites',
      'reviews',
      'notifications',
      'settings',
    ]);
    expect(items.every((item) => item.href.startsWith('/profile/athlete'))).toBe(true);
    expect(items.every((item) => item.label.length > 0)).toBe(true);
  });
});

describe('getProviderNavItems', () => {
  it('без публикаций и без bookings — только базовые разделы', () => {
    const items = getProviderNavItems({
      providerClubs: [],
      providerTrainers: [],
      hasProviderBookings: false,
    });

    expect(items.map((item) => item.key)).toEqual([
      'dashboard',
      'finance',
      'notifications',
      'settings',
    ]);
  });

  it('только clubs без bookings — publications/links/reviews добавляются', () => {
    const items = getProviderNavItems({
      providerClubs: [mockClub],
      providerTrainers: [],
      hasProviderBookings: false,
    });

    const keys = items.map((item) => item.key);

    expect(keys).toContain('publications');
    expect(keys).toContain('links');
    expect(keys).toContain('reviews');
    expect(keys).not.toContain('bookings');
    expect(keys).not.toContain('clients');
    expect(keys).not.toContain('stats');
  });

  it('только trainers без bookings — publications/links/reviews добавляются', () => {
    const items = getProviderNavItems({
      providerClubs: [],
      providerTrainers: [mockTrainer],
      hasProviderBookings: false,
    });

    const keys = items.map((item) => item.key);

    expect(keys).toContain('publications');
    expect(keys).toContain('links');
    expect(keys).toContain('reviews');
  });

  it('публикации + bookings — bookings/clients/stats добавляются', () => {
    const items = getProviderNavItems({
      providerClubs: [mockClub],
      providerTrainers: [],
      hasProviderBookings: true,
    });

    const keys = items.map((item) => item.key);

    expect(keys).toContain('bookings');
    expect(keys).toContain('clients');
    expect(keys).toContain('stats');
  });

  it('оба clubs и trainers с bookings — полный набор в детерминированном порядке', () => {
    const items = getProviderNavItems({
      providerClubs: [mockClub],
      providerTrainers: [mockTrainer],
      hasProviderBookings: true,
    });

    expect(items.map((item) => item.key)).toEqual([
      'dashboard',
      'publications',
      'bookings',
      'clients',
      'stats',
      'links',
      'reviews',
      'finance',
      'notifications',
      'settings',
    ]);
    expect(items.every((item) => item.href.startsWith('/profile/provider'))).toBe(true);
  });

  it('hasProviderBookings без публикаций — bookings-разделы не появляются', () => {
    // Защита инварианта: bookings невозможны без опубликованных услуг.
    const items = getProviderNavItems({
      providerClubs: [],
      providerTrainers: [],
      hasProviderBookings: true,
    });

    expect(items.map((item) => item.key)).toEqual([
      'dashboard',
      'finance',
      'notifications',
      'settings',
    ]);
  });
});
