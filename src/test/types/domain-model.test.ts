import { describe, expectTypeOf, expect, it } from 'vitest';

import type {
  Booking,
  CatalogOwnerType,
  Coordinates,
  EntityId,
  Offering,
  OfferingFormat,
  Review,
  Schedule,
  Trainer,
} from '@/types';

const trainerFixture: Trainer = {
  id: 101,
  createdAt: '2026-03-19T09:00:00.000Z',
  name: 'Илья Романов',
  slug: 'ilya-romanov',
  bio: 'Независимый тренер по функциональному тренингу.',
  avatarUrl: '/images/trainers/ilya-romanov.jpg',
  experienceYears: 8,
  specialties: ['Функциональный тренинг', 'Выносливость'],
  rating: 4.8,
  reviewCount: 12,
  priceFrom: 1800,
  sportIds: [4, 6],
  city: 'Самара',
  address: 'ул. Ново-Садовая, 181А',
  coordinates: {
    lat: 53.2251,
    lng: 50.1664,
  },
};

const offeringFixture: Offering = {
  id: 501,
  createdAt: '2026-03-19T09:00:00.000Z',
  ownerType: 'trainer',
  ownerId: trainerFixture.id,
  sportId: 4,
  title: 'Персональная функциональная тренировка',
  description: 'Индивидуальная сессия на силу и выносливость.',
  format: 'personal',
  price: 2200,
  durationMinutes: 60,
  capacity: 1,
  address: trainerFixture.address ?? 'Адрес уточняется',
  coordinates: trainerFixture.coordinates ?? { lat: 0, lng: 0 },
};

const scheduleFixture: Schedule = {
  id: 701,
  createdAt: '2026-03-19T09:00:00.000Z',
  offeringId: offeringFixture.id,
  ownerType: 'trainer',
  ownerId: trainerFixture.id,
  sportId: offeringFixture.sportId,
  title: offeringFixture.title,
  date: '2026-03-20',
  startTime: '10:00',
  endTime: '11:00',
  durationMinutes: offeringFixture.durationMinutes,
  level: 'all_levels',
  capacity: offeringFixture.capacity,
  bookedCount: 0,
  price: offeringFixture.price,
};

const bookingFixture: Booking = {
  id: 901,
  createdAt: '2026-03-19T09:00:00.000Z',
  scheduleId: scheduleFixture.id,
  offeringId: offeringFixture.id,
  ownerType: 'trainer',
  ownerId: trainerFixture.id,
  userId: 1,
  sportId: offeringFixture.sportId,
  date: scheduleFixture.date,
  status: 'confirmed',
  paymentStatus: 'unpaid',
  totalPrice: offeringFixture.price,
};

describe('Domain model contracts', () => {
  it('описывает услугу как отдельную сущность с владельцем клуба или тренера', () => {
    expectTypeOf<CatalogOwnerType>().toEqualTypeOf<'club' | 'trainer'>();
    expectTypeOf<OfferingFormat>().toEqualTypeOf<'group' | 'personal' | 'mini_group'>();
    expectTypeOf<Offering>().toMatchTypeOf<{
      ownerType: CatalogOwnerType;
      ownerId: EntityId;
      affiliatedClubId?: EntityId;
      sportId: EntityId;
      title: string;
      description: string;
      format: OfferingFormat;
      price: number;
      durationMinutes: number;
      capacity: number;
      address: string;
      coordinates: Coordinates;
    }>();
  });

  it('позволяет описывать тренера как самостоятельную сущность услуг', () => {
    expectTypeOf<Trainer>().toMatchTypeOf<{
      affiliatedClubId?: EntityId;
      sportIds: EntityId[];
      city?: string;
      address?: string;
      coordinates?: Coordinates;
    }>();
  });

  it('готовит расписание и запись к slot-based модели через offering', () => {
    expectTypeOf<Schedule>().toMatchTypeOf<{
      offeringId?: EntityId;
      ownerType?: CatalogOwnerType;
      ownerId?: EntityId;
      affiliatedClubId?: EntityId;
      clubId?: EntityId;
      trainerId?: EntityId;
      sportId: EntityId;
    }>();

    expectTypeOf<Booking>().toMatchTypeOf<{
      offeringId?: EntityId;
      ownerType?: CatalogOwnerType;
      ownerId?: EntityId;
      affiliatedClubId?: EntityId;
      clubId?: EntityId;
      trainerId?: EntityId;
      sportId: EntityId;
    }>();
  });

  it('сохраняет раздельные сценарии отзывов для клуба и тренера', () => {
    expectTypeOf<Review>().toMatchTypeOf<{
      clubId?: EntityId;
      trainerId?: EntityId;
    }>();
  });

  it('позволяет собрать фикстуры независимого тренера, услуги, слота и записи', () => {
    expect(trainerFixture.sportIds).toEqual([4, 6]);
    expect(offeringFixture.ownerType).toBe('trainer');
    expect(scheduleFixture.offeringId).toBe(offeringFixture.id);
    expect(bookingFixture.offeringId).toBe(offeringFixture.id);
    expect(bookingFixture.clubId).toBeUndefined();
  });
});
