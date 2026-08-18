import { describe, expect, it } from 'vitest';

import { getAthleteReviewItems } from '@/components/profile/athlete-review-items';
import type { Club, Review, Trainer } from '@sporthub/types';

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna-aquatic-club',
    description: 'Клуб с бассейном',
    shortDescription: 'Бассейн рядом с набережной.',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    phone: '+7 (846) 200-11-01',
    email: 'hello@volna-club.ru',
    website: 'https://volna-club.ru',
    coordinates: { lat: 53.2129, lng: 50.1245 },
    sportIds: [3, 8],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 900,
    distanceKm: 1.8,
  },
];

const trainers: Trainer[] = [
  {
    id: 5,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    sportIds: [1],
    sportId: 1,
    name: 'Анна Миронова',
    slug: 'anna-mironova',
    bio: 'Тренер по йоге.',
    avatarUrl: '/images/trainers/anna.jpg',
    experienceYears: 8,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 5,
    reviewCount: 36,
    priceFrom: 1300,
  },
];

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Любимый бассейн',
  },
  {
    id: 2,
    createdAt: '2026-03-18T09:00:00.000Z',
    userId: 1,
    trainerId: 5,
    rating: 4,
    text: 'Сильный тренер',
  },
];

describe('getAthleteReviewItems', () => {
  it('связывает отзывы с клубами и тренерами и сортирует новые сверху', () => {
    const reviewItems = getAthleteReviewItems({
      athleteUserId: 1,
      clubs,
      reviews,
      trainers,
    });

    expect(reviewItems).toHaveLength(2);
    expect(reviewItems[0]).toMatchObject({
      id: 2,
      rating: 4,
      targetName: 'Анна Миронова',
      targetTypeLabel: 'Отзыв о тренере',
    });
    expect(reviewItems[1]).toMatchObject({
      id: 1,
      rating: 5,
      targetName: 'Volna Aquatic Club',
      targetTypeLabel: 'Отзыв о клубе',
    });
  });

  it('без отзывов возвращает пустой список', () => {
    const reviewItems = getAthleteReviewItems({
      athleteUserId: 1,
      clubs,
      reviews: [],
      trainers,
    });

    expect(reviewItems).toEqual([]);
  });
});
