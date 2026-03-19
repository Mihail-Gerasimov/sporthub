import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PopularNearby } from '@/components/clubs/PopularNearby';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, Sport } from '@/types';
import type { TrainerDirectoryItem } from '@/components/trainers';

const sports: Pick<Sport, 'id' | 'name' | 'icon'>[] = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 2, name: 'Бокс', icon: '🥊' },
  { id: 3, name: 'Плавание', icon: '🏊' },
  { id: 4, name: 'Кроссфит', icon: '🏋️' },
  { id: 5, name: 'Танцы', icon: '💃' },
  { id: 6, name: 'Тренажёрный зал', icon: '🏋️‍♂️' },
  { id: 8, name: 'Пилатес', icon: '🤸' },
];

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna-aquatic-club',
    description: 'Клуб с бассейном и пилатесом',
    shortDescription: 'Бассейн и пилатес рядом с набережной.',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    phone: '+7 (846) 200-11-01',
    email: 'hello@volna-club.ru',
    website: 'https://volna-club.ru',
    coordinates: { lat: 53.2129, lng: 50.1245 },
    sportIds: [3, 8],
    imageUrls: ['/images/clubs/volna-1.jpg'],
    amenities: ['Бассейн 25 м'],
    tags: ['Бассейн', 'Восстановление', 'Утренние группы'],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 900,
    distanceKm: 1.8,
    isFeatured: true,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'North Ring Boxing Lab',
    slug: 'north-ring-boxing-lab',
    description: 'Зал бокса и ударной техники',
    shortDescription: 'Бокс и единоборства с сильной вечерней сеткой.',
    city: 'Самара',
    address: 'Московское шоссе, 41',
    phone: '+7 (846) 200-11-02',
    email: 'team@northring.ru',
    website: 'https://northring.ru',
    coordinates: { lat: 53.2334, lng: 50.2021 },
    sportIds: [2],
    imageUrls: ['/images/clubs/north-ring-1.jpg'],
    amenities: ['Ринг'],
    tags: ['Бокс', 'Спарринги', 'Вечерние группы'],
    rating: 4.7,
    reviewCount: 51,
    priceFrom: 1100,
    distanceKm: 5.4,
    isFeatured: true,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Balance Yoga House',
    slug: 'balance-yoga-house',
    description: 'Камерная студия для йоги и пилатеса',
    shortDescription: 'Йога и пилатес в центре города.',
    city: 'Самара',
    address: 'ул. Молодогвардейская, 86',
    phone: '+7 (846) 200-11-03',
    email: 'hello@balance-house.ru',
    website: 'https://balance-house.ru',
    coordinates: { lat: 53.1957, lng: 50.1006 },
    sportIds: [1, 8],
    imageUrls: ['/images/clubs/balance-1.jpg'],
    amenities: ['Коврики и блоки'],
    tags: ['Йога', 'Пилатес', 'Спокойный формат'],
    rating: 4.9,
    reviewCount: 72,
    priceFrom: 850,
    distanceKm: 2.3,
    isFeatured: true,
  },
  {
    id: 4,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Forge Crossfit Arena',
    slug: 'forge-crossfit-arena',
    description: 'Зал для кроссфита',
    shortDescription: 'Кроссфит и силовые тренировки с интенсивным темпом.',
    city: 'Самара',
    address: 'ул. Авроры, 150',
    phone: '+7 (846) 200-11-04',
    email: 'info@forge-arena.ru',
    website: 'https://forge-arena.ru',
    coordinates: { lat: 53.1904, lng: 50.1908 },
    sportIds: [4, 6],
    imageUrls: ['/images/clubs/forge-1.jpg'],
    amenities: ['Функциональная рама'],
    tags: ['Кроссфит', 'Сила', 'Интенсив'],
    rating: 4.6,
    reviewCount: 48,
    priceFrom: 1200,
    distanceKm: 6.1,
    isFeatured: false,
  },
  {
    id: 5,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Motion Dance Hub',
    slug: 'motion-dance-hub',
    description: 'Танцевальная студия',
    shortDescription: 'Танцы и мягкие фитнес-практики в одном пространстве.',
    city: 'Самара',
    address: 'ул. Ново-Садовая, 181А',
    phone: '+7 (846) 200-11-05',
    email: 'hi@motionhub.ru',
    website: 'https://motionhub.ru',
    coordinates: { lat: 53.2251, lng: 50.1664 },
    sportIds: [5, 1],
    imageUrls: ['/images/clubs/motion-1.jpg'],
    amenities: ['Танцевальный зал'],
    tags: ['Танцы', 'Choreo', 'Stretch vibe'],
    rating: 4.8,
    reviewCount: 37,
    priceFrom: 950,
    distanceKm: 4.2,
    isFeatured: false,
  },
  {
    id: 6,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Vector Fitness Club',
    slug: 'vector-fitness-club',
    description: 'Универсальный фитнес-клуб',
    shortDescription: 'Зал и функциональные тренировки для плотного графика.',
    city: 'Самара',
    address: 'ул. Демократическая, 7',
    phone: '+7 (846) 200-11-06',
    email: 'contact@vectorfit.ru',
    website: 'https://vectorfit.ru',
    coordinates: { lat: 53.2728, lng: 50.2369 },
    sportIds: [6, 4],
    imageUrls: ['/images/clubs/vector-1.jpg'],
    amenities: ['Кардио-зона'],
    tags: ['Фитнес', 'Экспресс-сессии', 'После работы'],
    rating: 4.5,
    reviewCount: 44,
    priceFrom: 700,
    distanceKm: 7.3,
    isFeatured: false,
  },
];

const trainers: TrainerDirectoryItem[] = [
  {
    id: 5,
    name: 'Анна Миронова',
    slug: 'anna-mironova',
    bio: 'Тренер по йоге.',
    avatarUrl: '/images/trainers/anna-mironova.jpg',
    experienceYears: 8,
    specialties: ['Хатха-йога', 'Утренние практики'],
    rating: 5,
    reviewCount: 36,
    priceFrom: 1300,
    sportIds: [1],
    sports: [{ id: 1, name: 'Йога', icon: '🧘' }],
    city: 'Самара',
    address: 'ул. Молодогвардейская, 86',
    coordinates: { lat: 53.1957, lng: 50.1006 },
    distanceKm: 2.3,
    venueName: 'Balance Yoga House',
    venueLabel: 'Balance Yoga House',
    venueAddress: 'ул. Молодогвардейская, 86',
    primaryOfferingId: 105,
    primaryOfferingTitle: 'Персональная тренировка: Йога',
    primaryOfferingFormat: 'personal',
    nextSlotId: 1005,
    nextSlotDate: '2026-03-20',
    nextSlotStartTime: '10:15',
    availableSlotsCount: 1,
    offeringTitles: ['Персональная тренировка: Йога'],
    searchText: 'анна миронова йога',
  },
  {
    id: 1,
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: 'Тренер по плаванию.',
    avatarUrl: '/images/trainers/marina-sokolova.jpg',
    experienceYears: 9,
    specialties: ['Кроль', 'Постановка дыхания'],
    rating: 4.9,
    reviewCount: 28,
    priceFrom: 1400,
    sportIds: [3],
    sports: [{ id: 3, name: 'Плавание', icon: '🏊' }],
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    coordinates: { lat: 53.2129, lng: 50.1245 },
    distanceKm: 1.8,
    venueName: 'Volna Aquatic Club',
    venueLabel: 'Volna Aquatic Club',
    venueAddress: 'ул. Лесная, 23к1',
    primaryOfferingId: 101,
    primaryOfferingTitle: 'Персональная тренировка: Плавание',
    primaryOfferingFormat: 'personal',
    nextSlotId: 1001,
    nextSlotDate: '2026-03-20',
    nextSlotStartTime: '08:15',
    availableSlotsCount: 1,
    offeringTitles: ['Персональная тренировка: Плавание'],
    searchText: 'марина соколова плавание',
  },
];

describe('PopularNearby', () => {
  beforeEach(() => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('показывает топ-клубы по рейтингу в горизонтальном скролле', () => {
    render(<PopularNearby clubs={clubs} sports={sports} trainers={trainers} />);

    expect(screen.getByRole('heading', { name: 'Популярное рядом' })).toBeInTheDocument();
    expect(screen.getByTestId('popular-nearby-scroll').className).toContain('overflow-x-auto');
    expect(screen.getByTestId('popular-nearby-scroll').className).toContain('py-3');

    const carouselCards = screen.getAllByTestId('club-card-surface');

    expect(carouselCards).toHaveLength(6);
    carouselCards.forEach((card) => {
      expect(card).toHaveAttribute('data-card-variant', 'carousel');
      expect(card.className).toContain('group-hover:-translate-y-0.5');
    });

    const clubLinks = screen.getAllByRole('link');
    const clubNames = clubLinks.map((link) => link.getAttribute('href'));

    expect(clubNames).toEqual([
      '/clubs/3',
      '/clubs/1',
      '/clubs/5',
      '/clubs/2',
      '/clubs/4',
      '/clubs/6',
    ]);
  });

  it('показывает кнопки прокрутки и листает слайдер влево и вправо', () => {
    render(<PopularNearby clubs={clubs} sports={sports} trainers={trainers} />);

    const scrollContainer = screen.getByTestId('popular-nearby-scroll');
    const scrollByMock = vi.fn();

    scrollContainer.scrollBy = scrollByMock;

    fireEvent.click(screen.getByRole('button', { name: 'Прокрутить популярные клубы влево' }));
    fireEvent.click(screen.getByRole('button', { name: 'Прокрутить популярные клубы вправо' }));

    expect(scrollByMock).toHaveBeenNthCalledWith(1, {
      left: -360,
      behavior: 'smooth',
    });
    expect(scrollByMock).toHaveBeenNthCalledWith(2, {
      left: 360,
      behavior: 'smooth',
    });
  });

  it('в trainer-mode показывает популярные карточки тренеров', () => {
    useFilterStore.setState({
      discoveryMode: 'trainers',
      searchQuery: '',
      selectedSportId: null,
    });

    render(<PopularNearby clubs={clubs} sports={sports} trainers={trainers} />);

    expect(screen.getByRole('heading', { name: 'Популярные тренеры' })).toBeInTheDocument();
    expect(screen.getByTestId('popular-trainers-scroll')).toBeInTheDocument();
    expect(screen.getByText('Анна Миронова')).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
  });
});
