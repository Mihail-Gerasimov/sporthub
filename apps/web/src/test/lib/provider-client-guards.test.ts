/**
 * Тесты guard'а isClientOfProvider (Phase 25 — Step 25.10).
 * Атлет считается клиентом провайдера, если у него есть хоть один booking,
 * чей clubId или trainerId ссылается на managed-сущность провайдера.
 */
import { describe, expect, it } from 'vitest';

import { isClientOfProvider } from '@/lib/provider-client-guards';
import type { Booking, Club, Trainer } from '@sporthub/types';

const providerUserId = 2;
const otherProviderUserId = 99;

const providerClub: Club = {
  id: 10,
  createdAt: '2026-04-22T00:00:00.000Z',
  name: 'Клуб провайдера',
  slug: 'cl-p',
  description: 'd',
  shortDescription: 'sd',
  city: 'Самара',
  address: 'a',
  phone: '+7',
  coordinates: { lat: 0, lng: 0 },
  sportIds: [],
  imageUrls: [],
  amenityIds: [],
  tagIds: [],
  rating: 0,
  reviewCount: 0,
  priceFrom: 0,
  distanceKm: 0,
  managedByUserId: providerUserId,
};

const foreignClub: Club = {
  ...providerClub,
  id: 20,
  name: 'Чужой клуб',
  managedByUserId: otherProviderUserId,
};

const providerTrainer: Trainer = {
  id: 30,
  createdAt: '2026-04-22T00:00:00.000Z',
  name: 'Тренер провайдера',
  slug: 'tr-p',
  bio: 'b',
  avatarUrl: '',
  experienceYears: 5,
  specialtyIds: [],
  workFormatIds: [],
  rating: 0,
  reviewCount: 0,
  priceFrom: 0,
  sportIds: [],
  managedByUserId: providerUserId,
};

function makeBooking(id: number, userId: number, patch: Partial<Booking> = {}): Booking {
  return {
    id,
    createdAt: '2026-04-22T00:00:00.000Z',
    scheduleId: 1,
    userId,
    sportId: 1,
    date: '2026-04-25',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 0,
    ...patch,
  };
}

describe('isClientOfProvider — Phase 25 Step 25.10', () => {
  it('возвращает true, если у атлета есть booking на club провайдера', () => {
    const bookings = [makeBooking(1, 1, { clubId: providerClub.id })];

    expect(isClientOfProvider(1, providerUserId, bookings, [providerClub], [providerTrainer])).toBe(
      true,
    );
  });

  it('возвращает true, если у атлета есть booking на trainer провайдера', () => {
    const bookings = [makeBooking(2, 1, { trainerId: providerTrainer.id })];

    expect(isClientOfProvider(1, providerUserId, bookings, [providerClub], [providerTrainer])).toBe(
      true,
    );
  });

  it('возвращает false, если booking привязан к чужому клубу/тренеру', () => {
    const bookings = [makeBooking(3, 1, { clubId: foreignClub.id })];

    expect(
      isClientOfProvider(
        1,
        providerUserId,
        bookings,
        [providerClub, foreignClub],
        [providerTrainer],
      ),
    ).toBe(false);
  });

  it('возвращает false, если у атлета вообще нет bookings у этого провайдера', () => {
    const bookings = [makeBooking(4, 2, { clubId: providerClub.id })]; // booking user=2 — не 1

    expect(isClientOfProvider(1, providerUserId, bookings, [providerClub], [providerTrainer])).toBe(
      false,
    );
  });
});
