// Тесты фильтрации по городу (Step 19.4)
// Покрывают: useFilterStore.selectedCity, filterClubs/filterTrainers с city-фильтром
import { beforeEach, describe, expect, it } from 'vitest';

import { filterClubs } from '@/components/clubs/filterClubs';
import { filterTrainers } from '@/components/trainers/filterTrainers';
import { DEFAULT_CITY } from '@sporthub/types';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, Coordinates } from '@sporthub/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

/* --- Фикстуры --- */

const defaultCoords: Coordinates = { lat: 53.2, lng: 50.1 };

const sports = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 2, name: 'Бокс', icon: '🥊' },
];

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Test Club',
    slug: 'test-club',
    description: 'Description',
    shortDescription: 'Short',
    city: 'Самара',
    address: 'ул. Ленина, 1',
    phone: '+7 (846) 100-00-00',
    coordinates: defaultCoords,
    sportIds: [1],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.0,
    reviewCount: 10,
    priceFrom: 500,
    distanceKm: 1,
    ...overrides,
  };
}

function makeTrainer(overrides: Partial<TrainerDirectoryItem> = {}): TrainerDirectoryItem {
  return {
    id: 1,
    name: 'Тренер',
    slug: 'trener',
    bio: 'Описание',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [],
    specialtyNames: [],
    rating: 4.0,
    reviewCount: 5,
    priceFrom: 1000,
    sportIds: [2],
    sports: [{ id: 2, name: 'Бокс', icon: '🥊' }],
    city: 'Самара',
    address: 'ул. Ленина, 1',
    coordinates: defaultCoords,
    distanceKm: null,
    venueName: null,
    venueLabel: '',
    venueAddress: '',
    primaryOfferingId: null,
    primaryOfferingTitle: null,
    primaryOfferingFormat: null,
    nextSlotId: null,
    nextSlotDate: null,
    nextSlotStartTime: null,
    availableSlotsCount: 0,
    offeringTitles: [],
    searchText: 'тренер бокс самара',
    ...overrides,
  };
}

/* ========================================
   1. useFilterStore — selectedCity
   ======================================== */

describe('useFilterStore — selectedCity (Step 19.4)', () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters();
  });

  it('дефолт selectedCity = DEFAULT_CITY', () => {
    expect(useFilterStore.getState().selectedCity).toBe(DEFAULT_CITY);
  });

  it('setSelectedCity обновляет город', () => {
    useFilterStore.getState().setSelectedCity('Москва');
    expect(useFilterStore.getState().selectedCity).toBe('Москва');
  });

  it('setSelectedCity приводит город к виду для показа через formatCityTitleCase()', () => {
    useFilterStore.getState().setSelectedCity('саНКТ-пЕТЕРБУРГ');
    expect(useFilterStore.getState().selectedCity).toBe('Санкт-Петербург');
  });

  it('resetFilters сбрасывает selectedCity к DEFAULT_CITY', () => {
    useFilterStore.getState().setSelectedCity('Казань');
    useFilterStore.getState().resetFilters();
    expect(useFilterStore.getState().selectedCity).toBe(DEFAULT_CITY);
  });
});

/* ========================================
   2. filterClubs — фильтр по городу
   ======================================== */

describe('filterClubs с фильтром по городу (Step 19.4)', () => {
  const clubSamara = makeClub({ id: 1, name: 'Клуб Самара', city: 'Самара' });
  const clubMoscow = makeClub({ id: 2, name: 'Клуб Москва', city: 'Москва' });
  const clubSamaraLower = makeClub({ id: 3, name: 'Клуб самара', city: 'самара' });

  it('фильтрует клубы по городу (case-insensitive)', () => {
    const result = filterClubs({
      clubs: [clubSamara, clubMoscow],
      sports,
      searchQuery: '',
      selectedSportId: null,
      selectedCity: 'Самара',
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Клуб Самара');
  });

  it('case-insensitive сравнение города', () => {
    const result = filterClubs({
      clubs: [clubSamara, clubSamaraLower],
      sports,
      searchQuery: '',
      selectedSportId: null,
      selectedCity: 'самара',
    });

    expect(result).toHaveLength(2);
  });

  it('пустой selectedCity — показывает все клубы', () => {
    const result = filterClubs({
      clubs: [clubSamara, clubMoscow],
      sports,
      searchQuery: '',
      selectedSportId: null,
      selectedCity: '',
    });

    expect(result).toHaveLength(2);
  });

  it('комбинация city + sportId', () => {
    const clubSamaraYoga = makeClub({ id: 4, name: 'Йога Самара', city: 'Самара', sportIds: [1] });
    const clubSamaraBox = makeClub({ id: 5, name: 'Бокс Самара', city: 'Самара', sportIds: [2] });
    const clubMoscowYoga = makeClub({ id: 6, name: 'Йога Москва', city: 'Москва', sportIds: [1] });

    const result = filterClubs({
      clubs: [clubSamaraYoga, clubSamaraBox, clubMoscowYoga],
      sports,
      searchQuery: '',
      selectedSportId: 1,
      selectedCity: 'Самара',
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Йога Самара');
  });
});

/* ========================================
   3. filterTrainers — фильтр по городу
   ======================================== */

describe('filterTrainers с фильтром по городу (Step 19.4)', () => {
  const trainerSamara = makeTrainer({ id: 1, name: 'Тренер Самара', city: 'Самара' });
  const trainerMoscow = makeTrainer({ id: 2, name: 'Тренер Москва', city: 'Москва' });

  it('фильтрует тренеров по городу (case-insensitive)', () => {
    const result = filterTrainers({
      trainers: [trainerSamara, trainerMoscow],
      searchQuery: '',
      selectedSportId: null,
      selectedCity: 'Самара',
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Тренер Самара');
  });

  it('пустой selectedCity — показывает всех тренеров', () => {
    const result = filterTrainers({
      trainers: [trainerSamara, trainerMoscow],
      searchQuery: '',
      selectedSportId: null,
      selectedCity: '',
    });

    expect(result).toHaveLength(2);
  });
});
