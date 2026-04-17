// Тесты create-контракта публикации клуба (Step 14.3)
import { describe, expect, it } from 'vitest';

import { mapClubFormToEntities } from '@/lib/contracts/publish-club';

/* Минимальная валидная форма клуба */
const validForm = {
  name: 'FitZone Studio',
  city: 'Самара',
  address: 'ул. Ленина, 42',
  description:
    'Современный фитнес-клуб с тренажёрным залом, групповыми программами и зоной кроссфита. Работаем для тех, кто хочет тренироваться в комфортной обстановке.',
  phone: '+7 (846) 300-00-01',
  email: 'hello@fitzone.ru',
  priceFrom: '1200',
  sportIds: [1, 4],
  tagIds: [1, 2],
  amenityIds: [1, 2],
  vk: '',
  telegram: '',
  facebook: '',
  scheduleSlots: [
    {
      title: 'Утренняя йога',
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '09:00',
      price: '900',
      capacity: '15',
      location: 'Зал №1',
      discipline: 'Йога',
    },
    {
      title: 'Кроссфит вечер',
      date: '2026-04-01',
      startTime: '19:00',
      endTime: '20:00',
      price: '1200',
      capacity: '10',
      location: 'Зал №2',
      discipline: 'Кроссфит',
    },
  ],
};

const PROVIDER_USER_ID = 2;

describe('publish-club contract (Step 14.3)', () => {
  /* --- Club mapping --- */

  it('маппит форму в клуб с корректными полями', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);

    expect(club.name).toBe('FitZone Studio');
    expect(club.city).toBe('Самара');
    expect(club.address).toBe('ул. Ленина, 42');
    expect(club.description).toBe(validForm.description);
    expect(club.phone).toBe('+7 (846) 300-00-01');
    expect(club.email).toBe('hello@fitzone.ru');
    expect(club.priceFrom).toBe(1200);
    expect(club.tagIds).toEqual([1, 2]);
    expect(club.amenityIds).toEqual([1, 2]);
  });

  it('генерирует slug из name (kebab-case, lowercase)', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);
    expect(club.slug).toBe('fitzone-studio');
  });

  it('генерирует shortDescription из первых ~120 символов description', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);

    expect(club.shortDescription.length).toBeLessThanOrEqual(125);
    expect(validForm.description.startsWith(club.shortDescription.replace(/…$/, ''))).toBe(true);
  });

  it('маппит sportIds → sportIds напрямую', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);
    // sportIds: [1, 4] — Йога, Кроссфит
    expect(club.sportIds).toEqual([1, 4]);
  });

  it('выставляет source = provider, status = published', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);
    expect(club.source).toBe('provider');
    expect(club.status).toBe('published');
  });

  it('выставляет managedByUserId из аргумента', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);
    expect(club.managedByUserId).toBe(2);
  });

  it('ставит safe defaults: coordinates, imageUrls, rating, reviewCount, distanceKm, isFeatured', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);

    expect(club.coordinates).toEqual({ lat: 0, lng: 0 });
    expect(club.imageUrls).toEqual([]);
    expect(club.rating).toBe(0);
    expect(club.reviewCount).toBe(0);
    expect(club.distanceKm).toBe(0);
    expect(club.isFeatured).toBe(false);
  });

  it('генерирует id и createdAt', () => {
    const { club } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);

    expect(club.id).toBeTypeOf('number');
    expect(club.id).toBeGreaterThan(0);
    expect(club.createdAt).toBeTruthy();
  });

  /* --- Offering mapping --- */

  it('создаёт одну клубную offering (group, ownerType=club)', () => {
    const { offering } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);

    expect(offering.ownerType).toBe('club');
    expect(offering.format).toBe('group');
    expect(offering.title).toContain(validForm.name);
    expect(offering.price).toBe(1200);
    expect(offering.address).toBe('ул. Ленина, 42');
    expect(offering.coordinates).toEqual({ lat: 0, lng: 0 });
  });

  it('offering.ownerId совпадает с club.id', () => {
    const { club, offering } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);
    expect(offering.ownerId).toBe(club.id);
    expect(offering.affiliatedClubId).toBe(club.id);
  });

  /* --- Schedule mapping --- */

  it('создаёт schedule[] из scheduleSlots формы', () => {
    const { schedules } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);

    expect(schedules).toHaveLength(2);
  });

  it('каждый schedule имеет корректные поля из формы', () => {
    const { schedules, club, offering } = mapClubFormToEntities(validForm, PROVIDER_USER_ID);

    const s0 = schedules[0];
    expect(s0.title).toBe('Утренняя йога');
    expect(s0.date).toBe('2026-04-01');
    expect(s0.startTime).toBe('08:00');
    expect(s0.endTime).toBe('09:00');
    expect(s0.price).toBe(900);
    expect(s0.capacity).toBe(15);
    expect(s0.room).toBe('Зал №1');
    expect(s0.bookedCount).toBe(0);
    expect(s0.level).toBe('all_levels');
    expect(s0.durationMinutes).toBe(60);

    // Связи
    expect(s0.ownerType).toBe('club');
    expect(s0.ownerId).toBe(club.id);
    expect(s0.clubId).toBe(club.id);
    expect(s0.offeringId).toBe(offering.id);
    // sportId = sportIds[0] из формы (все слоты получают первый sportId)
    expect(s0.sportId).toBe(1); // Йога (sportIds[0])

    const s1 = schedules[1];
    expect(s1.title).toBe('Кроссфит вечер');
    expect(s1.sportId).toBe(1); // sportIds[0] — по-слотовой маппинг будет в Step 23.9
  });

  /* --- Форма без email --- */

  it('email необязателен — клуб создаётся без email', () => {
    const formNoEmail = { ...validForm, email: '' };
    const { club } = mapClubFormToEntities(formNoEmail, PROVIDER_USER_ID);
    expect(club.email).toBeUndefined();
  });

  /* --- Неизвестная дисциплина --- */

  it('sportIds передаются напрямую без фильтрации', () => {
    const formWithIds = { ...validForm, sportIds: [1, 999] };
    const { club } = mapClubFormToEntities(formWithIds, PROVIDER_USER_ID);
    expect(club.sportIds).toEqual([1, 999]);
  });
});
