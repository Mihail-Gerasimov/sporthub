// Тесты data-driven навигации ЛК (Step 25.2): пункты зависят от того, чем человек
// владеет, и от наличия записей.
//
// ⚠️ Фаза 35, шаги 35.33–35.34. Прав роли в наборе больше нет, и это не упрощение
// теста, а исправление модели. Фаза 34 показывала раздел по ДВУМ условиям — право
// роли И наличие публикаций, — и права по дороге отменяли владение: человек
// с ролью «тренер» не видел раздела своих клубов, хотя клубы у него были.
// Живой случай заказчика («свой зал плюс персоналки на выезде») этой моделью
// не выражался вовсе. Условие осталось одно — владение, — и три случая ниже
// сверяются целиком: клуб, карточка, и то и другое.
import { describe, expect, it } from 'vitest';

import type { Club, Trainer } from '@sporthub/types';
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
  it('без лиц услуг и без записей — только базовые разделы', () => {
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

  it('только trainers без bookings — свой раздел, links и reviews добавляются', () => {
    const items = getProviderNavItems({
      providerClubs: [],
      providerTrainers: [mockTrainer],
      hasProviderBookings: false,
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
    });

    const keys = items.map((item) => item.key);

    expect(keys).toContain('bookings');
    expect(keys).toContain('clients');
    expect(keys).toContain('stats');
  });

  it('владелец клуба с записями — полный набор в детерминированном порядке', () => {
    const items = getProviderNavItems({
      providerClubs: [mockClub],
      providerTrainers: [],
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
  // ⚠️ Шаг 35.33. Три случая модели сверяются ЦЕЛИКОМ: клуб, карточка, оба сразу.
  describe('разделы считаются от владения', () => {
    it('наборы разделов у владельца клуба и владельца карточки разные', () => {
      const clubOwner = getProviderNavItems({
        providerClubs: [mockClub],
        providerTrainers: [],
        hasProviderBookings: true,
      });
      const trainer = getProviderNavItems({
        providerClubs: [],
        providerTrainers: [mockTrainer],
        hasProviderBookings: true,
      });

      // Сравнение списком, а не «на глаз»: различие ровно в разделе публикаций.
      expect(clubOwner.map((item) => item.key)).not.toEqual(trainer.map((item) => item.key));
      expect(clubOwner.map((item) => item.key)).toContain('publications');
      expect(clubOwner.map((item) => item.key)).not.toContain('trainer-profile');
      expect(trainer.map((item) => item.key)).toContain('trainer-profile');
      expect(trainer.map((item) => item.key)).not.toContain('publications');
    });

    it('у кого и клуб, и карточка — оба раздела сразу', () => {
      // ⚠️ Живой случай заказчика: свой зал плюс персоналки на выезде. Прежняя
      // модель его не выражала — право роли отменяло одно из двух владений,
      // и человек не видел раздела клубов, которыми управляет.
      const items = getProviderNavItems({
        providerClubs: [mockClub],
        providerTrainers: [mockTrainer],
        hasProviderBookings: true,
      });

      expect(items.map((item) => item.key)).toEqual([
        'dashboard',
        'publications',
        'trainer-profile',
        'bookings',
        'clients',
        'stats',
        'links',
        'reviews',
        'finance',
        'notifications',
        'settings',
      ]);
    });

    it('у кого лиц услуг нет вовсе — только базовые разделы, даже при записях', () => {
      // Страховка: пустой ответ бэкенда не должен превращаться в кабинет,
      // где показано всё.
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
});
