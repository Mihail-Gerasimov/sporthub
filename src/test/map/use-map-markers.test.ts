// Тесты useMapMarkers (Step 19.7)
// Покрывают: фильтрация по discoveryMode, sportId, city, исключение невалидных координат, empty state
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CITY } from '@/lib/constants';
import type { Club, Coordinates } from '@/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

/* --- Мок useFilterStore --- */
const mockFilterState = {
  discoveryMode: 'clubs' as 'clubs' | 'trainers',
  selectedSportId: null as number | null,
  selectedCity: DEFAULT_CITY,
};

vi.mock('@/stores/useFilterStore', () => ({
  useFilterStore: (selector: (state: typeof mockFilterState) => unknown) =>
    selector(mockFilterState),
}));

// Импорт после моков
const { useMapMarkers } = await import('@/components/map/useMapMarkers');

/** Хелпер — вызов хука через renderHook */
function callUseMapMarkers(
  ...args: Parameters<typeof useMapMarkers>
): ReturnType<typeof useMapMarkers> {
  const { result } = renderHook(() => useMapMarkers(...args));
  return result.current;
}

/* --- Фикстуры --- */

const validCoords: Coordinates = { lat: 53.2, lng: 50.1 };
const invalidCoords: Coordinates = { lat: 0, lng: 0 };

const sports = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 2, name: 'Бокс', icon: '🥊' },
];

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Клуб Самара',
    slug: 'club-samara',
    description: 'Описание',
    shortDescription: 'Кратко',
    city: 'Самара',
    address: 'ул. Ленина, 1',
    phone: '+7 (846) 100-00-00',
    coordinates: validCoords,
    sportIds: [1],
    imageUrls: [],
    amenities: [],
    tags: [],
    rating: 4.5,
    reviewCount: 10,
    priceFrom: 500,
    distanceKm: 1,
    isFeatured: false,
    ...overrides,
  };
}

function makeTrainer(overrides: Partial<TrainerDirectoryItem> = {}): TrainerDirectoryItem {
  return {
    id: 10,
    name: 'Тренер Самара',
    slug: 'trainer-samara',
    bio: 'Описание',
    avatarUrl: '',
    experienceYears: 5,
    specialties: [],
    rating: 4.0,
    reviewCount: 5,
    priceFrom: 1000,
    sportIds: [2],
    sports: [{ id: 2, name: 'Бокс', icon: '🥊' }],
    city: 'Самара',
    address: 'ул. Ленина, 2',
    coordinates: validCoords,
    affiliatedClub: null,
    nextSession: null,
    searchText: 'тренер бокс самара',
    ...overrides,
  };
}

/* --- Тесты --- */

describe('useMapMarkers (Step 19.7)', () => {
  beforeEach(() => {
    mockFilterState.discoveryMode = 'clubs';
    mockFilterState.selectedSportId = null;
    mockFilterState.selectedCity = DEFAULT_CITY;
  });

  it('возвращает маркеры клубов в режиме clubs', () => {
    const clubs = [makeClub({ id: 1 }), makeClub({ id: 2, name: 'Клуб 2', slug: 'club-2' })];
    const trainers = [makeTrainer()];

    const markers = callUseMapMarkers({ clubs, trainers, sports });

    expect(markers).toHaveLength(2);
    expect(markers[0].type).toBe('club');
    expect(markers.every((m) => m.type === 'club')).toBe(true);
  });

  it('возвращает маркеры тренеров в режиме trainers', () => {
    mockFilterState.discoveryMode = 'trainers';

    const clubs = [makeClub()];
    const trainers = [
      makeTrainer({ id: 10 }),
      makeTrainer({ id: 11, name: 'Тренер 2', slug: 'trainer-2' }),
    ];

    const markers = callUseMapMarkers({ clubs, trainers, sports });

    expect(markers).toHaveLength(2);
    expect(markers.every((m) => m.type === 'trainer')).toBe(true);
  });

  it('фильтрует по sportId', () => {
    mockFilterState.selectedSportId = 1;

    const clubYoga = makeClub({ id: 1, sportIds: [1] });
    const clubBox = makeClub({ id: 2, sportIds: [2], name: 'Бокс Клуб', slug: 'box-club' });

    const markers = callUseMapMarkers({ clubs: [clubYoga, clubBox], trainers: [], sports });

    expect(markers).toHaveLength(1);
    expect(markers[0].name).toBe('Клуб Самара');
  });

  it('фильтрует по городу (case-insensitive)', () => {
    mockFilterState.selectedCity = 'Самара';

    const clubSamara = makeClub({ id: 1, city: 'Самара' });
    const clubMoscow = makeClub({
      id: 2,
      city: 'Москва',
      name: 'Клуб Москва',
      slug: 'club-moscow',
    });

    const markers = callUseMapMarkers({ clubs: [clubSamara, clubMoscow], trainers: [], sports });

    expect(markers).toHaveLength(1);
    expect(markers[0].name).toBe('Клуб Самара');
  });

  it('исключает сущности с невалидными координатами {0, 0}', () => {
    const clubValid = makeClub({ id: 1, coordinates: validCoords });
    const clubInvalid = makeClub({
      id: 2,
      coordinates: invalidCoords,
      name: 'Без координат',
      slug: 'no-coords',
    });

    const markers = callUseMapMarkers({ clubs: [clubValid, clubInvalid], trainers: [], sports });

    expect(markers).toHaveLength(1);
    expect(markers[0].name).toBe('Клуб Самара');
  });

  it('формирует корректную структуру маркера', () => {
    const club = makeClub({
      id: 1,
      name: 'Йога-студия',
      slug: 'yoga-studio',
      address: 'ул. Мира, 5',
      rating: 4.8,
      sportIds: [1],
      coordinates: { lat: 53.2, lng: 50.1 },
    });

    const markers = callUseMapMarkers({ clubs: [club], trainers: [], sports });

    expect(markers[0]).toEqual({
      id: 1,
      slug: 'yoga-studio',
      name: 'Йога-студия',
      sportName: 'Йога',
      address: 'ул. Мира, 5',
      rating: 4.8,
      coordinates: { lat: 53.2, lng: 50.1 },
      type: 'club',
    });
  });

  it('пустой массив маркеров — empty state', () => {
    mockFilterState.selectedCity = 'Казань';

    const markers = callUseMapMarkers({ clubs: [makeClub()], trainers: [], sports });

    expect(markers).toHaveLength(0);
  });

  it('комбинация фильтров: city + sportId + discoveryMode', () => {
    mockFilterState.discoveryMode = 'trainers';
    mockFilterState.selectedSportId = 2;
    mockFilterState.selectedCity = 'Самара';

    const trainerMatch = makeTrainer({ id: 10, city: 'Самара', sportIds: [2] });
    const trainerWrongSport = makeTrainer({
      id: 11,
      city: 'Самара',
      sportIds: [1],
      name: 'Wrong',
      slug: 'wrong',
    });
    const trainerWrongCity = makeTrainer({
      id: 12,
      city: 'Москва',
      sportIds: [2],
      name: 'Moscow',
      slug: 'moscow',
    });

    const markers = callUseMapMarkers({
      clubs: [makeClub()],
      trainers: [trainerMatch, trainerWrongSport, trainerWrongCity],
      sports,
    });

    expect(markers).toHaveLength(1);
    expect(markers[0].name).toBe('Тренер Самара');
  });
});
