// Тесты data-driven навигации ЛК (Step 25.2): пункты зависят от наличия публикаций
// и bookings, а после этапа Э8a — ещё и от прав вошедшего.
import { describe, expect, it } from 'vitest';

import { capabilitiesOf } from '@sporthub/domain';
import type { Club, Trainer } from '@sporthub/types';
import { getAthleteNavItems, getProviderNavItems } from '@/components/profile/profile-nav-items';

// Права берутся из общего словаря, а не выписываются строками: набор роли меняется
// в одном месте, и тест обязан ехать за ним, а не хранить его копию.
const CLUB_OWNER = capabilitiesOf('club_owner');
const TRAINER = capabilitiesOf('trainer');

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
      capabilities: CLUB_OWNER,
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
      capabilities: CLUB_OWNER,
    });

    const keys = items.map((item) => item.key);

    expect(keys).toContain('publications');
    expect(keys).toContain('links');
    expect(keys).toContain('reviews');
    expect(keys).not.toContain('bookings');
    expect(keys).not.toContain('clients');
    expect(keys).not.toContain('stats');
  });

  it('только trainers без bookings — свой раздел, links и reviews добавляются', () => {
    const items = getProviderNavItems({
      providerClubs: [],
      providerTrainers: [mockTrainer],
      hasProviderBookings: false,
      capabilities: TRAINER,
    });

    const keys = items.map((item) => item.key);

    // У тренера раздел публикаций свой: он ведёт одну карточку, а не список клубов.
    expect(keys).toContain('trainer-profile');
    expect(keys).not.toContain('publications');
    expect(keys).toContain('links');
    expect(keys).toContain('reviews');
  });

  it('публикации + bookings — bookings/clients/stats добавляются', () => {
    const items = getProviderNavItems({
      providerClubs: [mockClub],
      providerTrainers: [],
      hasProviderBookings: true,
      capabilities: CLUB_OWNER,
    });

    const keys = items.map((item) => item.key);

    expect(keys).toContain('bookings');
    expect(keys).toContain('clients');
    expect(keys).toContain('stats');
  });

  it('представитель услуг с клубом и bookings — полный набор в детерминированном порядке', () => {
    const items = getProviderNavItems({
      providerClubs: [mockClub],
      // Карточка тренера по старым данным принадлежит ему же — раздела для неё
      // всё равно не будет: права на неё у роли нет.
      providerTrainers: [mockTrainer],
      hasProviderBookings: true,
      capabilities: CLUB_OWNER,
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
      capabilities: CLUB_OWNER,
    });

    expect(items.map((item) => item.key)).toEqual([
      'dashboard',
      'finance',
      'notifications',
      'settings',
    ]);
  });
  // Этап Э8a: решение заказчика от 08.09.2026. Разделы кабинета показываются
  // по правам, а не по одному признаку «провайдер».
  describe('разделение представителя услуг и тренера', () => {
    it('наборы разделов у двух ролей разные', () => {
      const clubOwner = getProviderNavItems({
        providerClubs: [mockClub],
        providerTrainers: [],
        hasProviderBookings: true,
        capabilities: CLUB_OWNER,
      });
      const trainer = getProviderNavItems({
        providerClubs: [],
        providerTrainers: [mockTrainer],
        hasProviderBookings: true,
        capabilities: TRAINER,
      });

      // Сравнение списком, а не «на глаз»: различие ровно в разделе публикаций.
      expect(clubOwner.map((item) => item.key)).not.toEqual(trainer.map((item) => item.key));
      expect(clubOwner.map((item) => item.key)).toContain('publications');
      expect(trainer.map((item) => item.key)).toContain('trainer-profile');
    });

    it('у тренера нет раздела клубов, даже если клуб ему достался по старым данным', () => {
      const items = getProviderNavItems({
        providerClubs: [mockClub],
        providerTrainers: [],
        hasProviderBookings: true,
        capabilities: TRAINER,
      });

      // Публикаций своего вида нет — значит, нет и всего, что от них зависит.
      expect(items.map((item) => item.key)).toEqual([
        'dashboard',
        'finance',
        'notifications',
        'settings',
      ]);
    });

    it('без прав вовсе остаются только базовые разделы', () => {
      // Страховка от пустого списка прав: недоступный бэкенд не должен
      // превращаться в кабинет, где показано всё.
      const items = getProviderNavItems({
        providerClubs: [mockClub],
        providerTrainers: [mockTrainer],
        hasProviderBookings: true,
        capabilities: [],
      });

      expect(items.map((item) => item.key)).toEqual([
        'dashboard',
        'finance',
        'notifications',
        'settings',
      ]);
    });
  });
});
