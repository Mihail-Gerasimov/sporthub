import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithToast as render } from '@/test/helpers/render-with-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClubDetailPageClient } from '@/components/clubs/ClubDetailPageClient';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type {
  Amenity,
  Club,
  Review,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
} from '@sporthub/types';

const club: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном, утренними дорожками и спокойным восстановлением.',
  shortDescription: 'Бассейн и пилатес рядом с набережной.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  email: 'hello@volna-club.ru',
  website: 'https://volna-club.ru',
  coordinates: {
    lat: 53.2129,
    lng: 50.1245,
  },
  sportIds: [3, 8],
  imageUrls: ['/images/clubs/volna-1.jpg', '/images/clubs/volna-2.jpg'],
  amenityIds: [1, 2],
  tagIds: [1, 2],
  rating: 4.8,
  reviewCount: 64,
  priceFrom: 900,
  distanceKm: 1.8,
};

const sports: Sport[] = [
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Плавание',
    slug: 'swimming',
    description: 'Плавание',
    icon: '🏊',
    imageUrl: '/images/sports/swimming.jpg',
    isPopular: true,
  },
  {
    id: 8,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Пилатес',
    slug: 'pilates',
    description: 'Пилатес',
    icon: '🤸',
    imageUrl: '/images/sports/pilates.jpg',
    isPopular: true,
  },
];

// Шаг 25.1b снял с Trainer поля clubId/affiliatedClubId: связь тренер↔клуб
// живёт только в trainer-club-links, поэтому в фикстуре её и не должно быть.
const trainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    sportIds: [3],
    sportId: 3,
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: 'Тренер по плаванию с мягким входом для взрослых новичков.',
    avatarUrl: '/images/trainers/marina.jpg',
    experienceYears: 9,
    specialtyIds: [1, 2],
    workFormatIds: [1],
    rating: 4.9,
    reviewCount: 28,
    priceFrom: 1400,
  },
];

/* Phase 28.22: расписание показывает только текущую ISO-неделю, поэтому
 * тесты фиксируют системное время на 2026-03-18 (среда) — слот ниже
 * попадает в активную неделю Пн 2026-03-16 .. Вс 2026-03-22. */
const schedule: Schedule[] = [
  {
    id: 21,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    /* Phase 30.7: фиксированное системное время в тесте — 10:00 UTC = 14:00 Samara.
       Чтобы слот оставался upcoming, ставим startTime/endTime после 14:00 Samara. */
    title: 'Утреннее плавание',
    description: 'Спокойная работа на технику.',
    date: '2026-03-18',
    startTime: '17:30',
    endTime: '18:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 8,
    price: 1100,
    room: 'Бассейн A',
  },
];

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Очень чистый бассейн и спокойная атмосфера.',
  },
];

/* Справочники для резолвинга id → name */
const tags: Tag[] = [
  { id: 1, createdAt: '2026-03-17T09:00:00.000Z', name: 'Для начинающих' },
  { id: 2, createdAt: '2026-03-17T09:00:00.000Z', name: 'Для детей' },
];

const amenities: Amenity[] = [
  { id: 1, createdAt: '2026-03-17T09:00:00.000Z', name: 'Парковка' },
  { id: 2, createdAt: '2026-03-17T09:00:00.000Z', name: 'Душевые' },
];

const specialties: Specialty[] = [
  { id: 1, createdAt: '2026-03-17T09:00:00.000Z', name: 'Подготовка к соревнованиям' },
];

describe('ClubDetailPageClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    /* Phase 28.22: anchor расписания на 2026-03-18 (среда), чтобы слоты
     * фикстур попадали в текущую ISO-неделю (Пн 2026-03-16 .. Вс 2026-03-22). */
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    vi.restoreAllMocks();

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('рендерит ключевые секции и публичный контент клуба под Phase 28', () => {
    render(
      <ClubDetailPageClient
        amenities={amenities}
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Volna Aquatic Club' })).toBeInTheDocument();
    expect(screen.getByText('Club profile')).toBeInTheDocument();
    expect(screen.getAllByText('Плавание').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Марина Соколова' })).toBeInTheDocument();
    expect(screen.getByTestId('club-directions-section')).toBeInTheDocument();
    expect(screen.getByTestId('club-trainers-section')).toBeInTheDocument();
    expect(screen.getByTestId('club-trainer-card-1')).toBeInTheDocument();
  });

  // Фаза 38, шаг 38.53: знак проверки площадкой — по полю `verifiedAt`.
  it('у проверенного клуба в hero стоит знак «Клуб проверен» с подсказкой, у обычного — нет', () => {
    const { unmount } = render(
      <ClubDetailPageClient
        amenities={amenities}
        club={{ ...club, verifiedAt: '2026-09-15T10:00:00.000Z' }}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    const badge = screen.getByTestId('verified-badge');

    expect(badge).toHaveTextContent('Клуб проверен');
    expect(badge).toHaveAccessibleDescription(/проверила администрация/i);

    unmount();
    render(
      <ClubDetailPageClient
        amenities={amenities}
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    expect(screen.queryByTestId('verified-badge')).not.toBeInTheDocument();
  });

  it('для гостя показывает auth-подсказки вместо действий вошедшего', async () => {
    render(
      <ClubDetailPageClient
        amenities={amenities}
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Записаться на Утреннее плавание' }));

    expect(screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    expect(
      screen.getByText('Чтобы оставить отзыв, войдите или зарегистрируйтесь'),
    ).toBeInTheDocument();

    // Phase 24: toast auto-dismiss через 4000 мс (ранее ActionNotice истекал на 3200).
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });

    expect(
      screen.queryByText('Чтобы оставить отзыв, войдите или зарегистрируйтесь'),
    ).not.toBeInTheDocument();
  });

  it('служебная запись записываться не может — базового набора человека у неё нет', () => {
    // ⚠️ Шаг 35.34. Прежде здесь стоял «provider»: типом учётной записи отнимали
    // право записаться у владельца клуба. Он такой же человек и на йогу ходит;
    // единственный, кому записываться нечем, — служебная запись (решение 5.2).
    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
      user: {
        name: 'Администратор',
        email: 'admin@sporthub.local',
      },
    });

    render(
      <ClubDetailPageClient
        amenities={amenities}
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Записаться на Утреннее плавание' }));

    expect(screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь')).toBeInTheDocument();
  });

  it('для athlete даёт перейти к записи и отправить отзыв через fake API', async () => {
    /* Используем real timers для async waitFor + setTimeout логики fetchMock. */
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 2,
          createdAt: '2026-03-18T10:00:00.000Z',
          userId: 1,
          clubId: 1,
          rating: 5,
          text: 'Очень понравилась спокойная атмосфера.',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <ClubDetailPageClient
        amenities={amenities}
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    expect(screen.getByRole('link', { name: 'Записаться на Утреннее плавание' })).toHaveAttribute(
      'href',
      '/booking/21',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Оценить на 5 из 5' }));
    fireEvent.change(screen.getByLabelText('Отзыв'), {
      target: { value: 'Очень понравилась спокойная атмосфера.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reviews',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(screen.getByText('Очень понравилась спокойная атмосфера.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Отзыв отправлен.')).toBeInTheDocument();
    });
  });

  it('содержит slug-ссылку на страницу тренера в секции тренеров', () => {
    render(
      <ClubDetailPageClient
        amenities={amenities}
        club={club}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    expect(screen.getByRole('link', { name: 'Марина Соколова' })).toHaveAttribute(
      'href',
      '/trainers/marina-sokolova',
    );
  });

  it('отображает соцсети в блоке контактов, если заполнены (Step 23.10)', () => {
    const clubWithSocials: Club = {
      ...club,
      vk: 'https://vk.com/volna',
      telegram: 'https://t.me/volna',
      facebook: '',
    };

    render(
      <ClubDetailPageClient
        amenities={amenities}
        club={clubWithSocials}
        reviews={reviews}
        reviewAuthors={{ 1: 'Алексей Смирнов' }}
        schedule={schedule}
        specialties={specialties}
        sports={sports}
        tags={tags}
        trainers={trainers}
      />,
    );

    const vkLink = screen.getByRole('link', { name: /vk/i });

    expect(vkLink).toHaveAttribute('href', 'https://vk.com/volna');

    const tgLink = screen.getByRole('link', { name: /telegram/i });

    expect(tgLink).toHaveAttribute('href', 'https://t.me/volna');
    // facebook пустой — не должен отображаться
    expect(screen.queryByRole('link', { name: /facebook/i })).not.toBeInTheDocument();
  });
});
