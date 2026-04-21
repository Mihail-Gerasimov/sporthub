import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithToast as render } from '@/test/helpers/render-with-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import AthleteProfileRoute from '@/app/profile/athlete/page';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Club, Review, Schedule, Trainer } from '@/types';
import type { User } from '@/types';

const profileBookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 21,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-19',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1100,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 19,
    userId: 1,
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    date: '2026-03-11',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 900,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 24,
    userId: 1,
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    date: '2026-03-20',
    status: 'cancelled_by_athlete',
    paymentStatus: 'unpaid',
    totalPrice: 1200,
  },
];

const profileSchedule: Schedule[] = [
  {
    id: 21,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Утреннее плавание',
    date: '2026-03-19',
    startTime: '07:30',
    endTime: '08:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 8,
    price: 1100,
    room: 'Бассейн A',
  },
  {
    id: 19,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    title: 'Утренняя хатха-йога',
    date: '2026-03-11',
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 12,
    bookedCount: 6,
    price: 900,
    room: 'Зал Light',
  },
  {
    id: 24,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    title: 'Бокс. Базовая техника',
    date: '2026-03-20',
    startTime: '08:00',
    endTime: '09:00',
    durationMinutes: 60,
    level: 'beginner',
    capacity: 16,
    bookedCount: 12,
    price: 1200,
    room: 'Ринг 1',
  },
];

const profileClubs: Club[] = [
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
    isFeatured: true,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Balance Yoga House',
    slug: 'balance-yoga-house',
    description: 'Клуб йоги',
    shortDescription: 'Йога в центре города.',
    city: 'Самара',
    address: 'ул. Молодогвардейская, 86',
    phone: '+7 (846) 200-11-03',
    email: 'hello@balance-house.ru',
    website: 'https://balance-house.ru',
    coordinates: { lat: 53.1957, lng: 50.1006 },
    sportIds: [1, 8],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.9,
    reviewCount: 72,
    priceFrom: 850,
    distanceKm: 2.3,
    isFeatured: true,
  },
];

const profileTrainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    sportIds: [3],
    sportId: 3,
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: 'Тренер по плаванию.',
    avatarUrl: '/images/trainers/marina.jpg',
    experienceYears: 9,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 4.9,
    reviewCount: 28,
    priceFrom: 1400,
  },
  {
    id: 5,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
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

const profileReviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Отзыв 1',
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 3,
    rating: 5,
    text: 'Отзыв 2',
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    trainerId: 5,
    rating: 5,
    text: 'Отзыв 3',
  },
];

const profileUsers: User[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'athlete',
    name: 'Алексей Смирнов',
    email: 'alexey@sporthub.local',
    phone: '+7 (927) 000-10-10',
    password: 'sporthub123',
    favoriteClubIds: [1, 3],
  },
];

const FROZEN_PROFILE_TEST_DATE = new Date('2026-03-19T12:00:00+04:00');

const historyBookings: Booking[] = [
  {
    id: 11,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 31,
    userId: 1,
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    date: '2026-03-11',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1600,
  },
  {
    id: 12,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 32,
    userId: 1,
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    date: '2026-03-09',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1200,
  },
];

const historySchedule: Schedule[] = [
  {
    id: 31,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    title: 'Персональная хатха-йога',
    date: '2026-03-11',
    startTime: '09:30',
    endTime: '10:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 1,
    bookedCount: 1,
    price: 1600,
    room: 'Private room',
  },
  {
    id: 32,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    title: 'Бокс. Базовая техника',
    date: '2026-03-09',
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    level: 'beginner',
    capacity: 16,
    bookedCount: 10,
    price: 1200,
    room: 'Ринг 1',
  },
];

const historyClubs: Club[] = [
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'North Ring Boxing Lab',
    slug: 'north-ring-boxing-lab',
    description: 'Клуб бокса',
    shortDescription: 'Бокс и спарринги.',
    city: 'Самара',
    address: 'Московское шоссе, 41',
    phone: '+7 (846) 200-11-02',
    email: 'hello@north-ring.ru',
    website: 'https://north-ring.ru',
    coordinates: { lat: 53.2337, lng: 50.1966 },
    sportIds: [2, 7],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.7,
    reviewCount: 51,
    priceFrom: 1100,
    distanceKm: 5.4,
    isFeatured: true,
  },
  ...profileClubs,
];

const historyTrainers: Trainer[] = [
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 2,
    sportIds: [2],
    sportId: 2,
    name: 'Тимур Каримов',
    slug: 'timur-karimov',
    bio: 'Тренер по боксу.',
    avatarUrl: '/images/trainers/timur.jpg',
    experienceYears: 11,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 4.8,
    reviewCount: 31,
    priceFrom: 1600,
  },
  ...profileTrainers,
];

describe('AthleteProfilePage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_PROFILE_TEST_DATE);
    localStorage.clear();

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createJsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
      },
    });
  }

  it('показывает athlete-only кабинет с данными пользователя из auth-state', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });

    render(await AthleteProfileRoute());

    expect(screen.getByRole('heading', { name: 'Кабинет спортсмена' })).toBeInTheDocument();
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getAllByText('alexey@sporthub.local').length).toBeGreaterThan(0);
    expect(screen.queryByText('Кабинет представителя спортивных услуг')).not.toBeInTheDocument();
  });

  it('для гостя показывает ограничение и открывает auth-модалку по CTA', async () => {
    render(await AthleteProfileRoute());

    expect(screen.getByText('Кабинет спортсмена доступен только после входа.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Войти или зарегистрироваться' }));

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
  });

  it('для provider не смешивает кабинеты и показывает отдельное ограничение', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'provider',
      user: {
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    render(await AthleteProfileRoute());

    expect(
      screen.getByText(
        'Ты вошёл как представитель спортивных услуг. Кабинет спортсмена недоступен.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Кабинет спортсмена' })).not.toBeInTheDocument();
  });

  it('для athlete показывает верхний профиль-блок, summary-метрики и logout', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Кабинет спортсмена' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Аватар Алексей Смирнов' })).toBeInTheDocument();
    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('1');
    expect(screen.getByTestId('athlete-summary-visits')).toHaveTextContent('1');
    expect(screen.getByTestId('athlete-summary-reviews')).toHaveTextContent('3');
    expect(screen.getByTestId('athlete-summary-achievements')).toHaveTextContent('4');
  });

  it('показывает ачивки отдельным блоком с открытыми и прогрессируемыми достижениями', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ачивки спортсмена' })).toBeInTheDocument();
    expect(screen.getByText('Общий прогресс')).toBeInTheDocument();
    expect(screen.getByText('Активная запись учтена')).toBeInTheDocument();
    expect(screen.getByText('60% общего прогресса')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Открытые ачивки' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ачивки в процессе' })).toBeInTheDocument();
    expect(screen.getByText('Первая запись на тренировку')).toBeInTheDocument();
    expect(screen.getByText('Первый отзыв')).toBeInTheDocument();
    expect(screen.getByText('Голос сообщества')).toBeInTheDocument();
    expect(screen.getByText('Исследователь')).toBeInTheDocument();
    expect(screen.getByText('Возвращение в зал')).toBeInTheDocument();
    expect(screen.getAllByText('1/3')).toHaveLength(2);
  });

  it('logout в кабинете спортсмена сбрасывает auth-state и возвращает ограничение доступа', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByText('Кабинет спортсмена доступен только после входа.')).toBeInTheDocument();
  });

  it('показывает только будущие или актуальные записи пользователя', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Предстоящие записи' })).toBeInTheDocument();
    const upcomingSection = screen.getByTestId('athlete-upcoming-section');

    expect(within(upcomingSection).getByText('Утреннее плавание')).toBeInTheDocument();
    expect(within(upcomingSection).getByText('Услуга клуба')).toBeInTheDocument();
    expect(within(upcomingSection).getByText('Volna Aquatic Club · Бассейн A')).toBeInTheDocument();
    expect(within(upcomingSection).getByText('Марина Соколова')).toBeInTheDocument();
    expect(within(upcomingSection).getByText('Подтверждена')).toBeInTheDocument();
    expect(
      within(upcomingSection).getByRole('button', { name: 'Отменить запись' }),
    ).toBeInTheDocument();
    expect(within(upcomingSection).queryByText('Утренняя хатха-йога')).not.toBeInTheDocument();
    expect(within(upcomingSection).queryByText('Бокс. Базовая техника')).not.toBeInTheDocument();
  });

  it('показывает пустое состояние блока предстоящих записей, если данных нет', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={[]}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Предстоящие записи' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Пока нет будущих записей. Новые бронирования появятся здесь после записи на занятия.',
      ),
    ).toBeInTheDocument();
  });

  it('сортирует предстоящие записи по дате и времени ближайшего слота', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    const sortedBookings: Booking[] = [
      {
        id: 101,
        createdAt: '2026-03-17T09:00:00.000Z',
        scheduleId: 101,
        userId: 1,
        clubId: 1,
        trainerId: 1,
        sportId: 3,
        date: '2026-03-20',
        status: 'confirmed',
        paymentStatus: 'unpaid',
        totalPrice: 1100,
      },
      {
        id: 102,
        createdAt: '2026-03-17T09:00:00.000Z',
        scheduleId: 102,
        userId: 1,
        clubId: 1,
        trainerId: 1,
        sportId: 3,
        date: '2026-03-19',
        status: 'confirmed',
        paymentStatus: 'unpaid',
        totalPrice: 1100,
      },
      {
        id: 103,
        createdAt: '2026-03-17T09:00:00.000Z',
        scheduleId: 103,
        userId: 1,
        clubId: 1,
        trainerId: 1,
        sportId: 3,
        date: '2026-03-19',
        status: 'pending',
        paymentStatus: 'unpaid',
        totalPrice: 1100,
      },
    ];

    const sortedSchedule: Schedule[] = [
      {
        id: 101,
        createdAt: '2026-03-17T09:00:00.000Z',
        clubId: 1,
        trainerId: 1,
        sportId: 3,
        title: 'Поздний бассейн',
        date: '2026-03-20',
        startTime: '20:00',
        endTime: '21:00',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 14,
        bookedCount: 8,
        price: 1100,
        room: 'Бассейн C',
      },
      {
        id: 102,
        createdAt: '2026-03-17T09:00:00.000Z',
        clubId: 1,
        trainerId: 1,
        sportId: 3,
        title: 'Ранний бассейн',
        date: '2026-03-19',
        startTime: '06:45',
        endTime: '07:45',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 14,
        bookedCount: 8,
        price: 1100,
        room: 'Бассейн A',
      },
      {
        id: 103,
        createdAt: '2026-03-17T09:00:00.000Z',
        clubId: 1,
        trainerId: 1,
        sportId: 3,
        title: 'Дневной бассейн',
        date: '2026-03-19',
        startTime: '13:30',
        endTime: '14:30',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 14,
        bookedCount: 8,
        price: 1100,
        room: 'Бассейн B',
      },
    ];

    render(
      <AthleteProfilePage
        bookings={sortedBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={sortedSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    const upcomingSection = screen.getByTestId('athlete-upcoming-section');
    const titles = within(upcomingSection)
      .getAllByTestId('athlete-upcoming-card-title')
      .map((title) => title.textContent);

    expect(titles).toEqual(['Ранний бассейн', 'Дневной бассейн', 'Поздний бассейн']);
  });

  it('после hard-cancel убирает карточку из upcoming-блока и обновляет summary count', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    const { rerender } = render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    const upcomingSection = screen.getByTestId('athlete-upcoming-section');
    const historySection = screen.getByTestId('athlete-history-section');

    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('1');
    expect(screen.getByText('Активная запись учтена')).toBeInTheDocument();
    expect(screen.getByText('60% общего прогресса')).toBeInTheDocument();
    expect(screen.getByText('Первая запись на тренировку')).toBeInTheDocument();
    expect(screen.getByTestId('athlete-summary-achievements')).toHaveTextContent('4');
    expect(within(upcomingSection).getByText('Утреннее плавание')).toBeInTheDocument();
    expect(within(historySection).getByText('1 завершено')).toBeInTheDocument();
    expect(within(historySection).getByText('Утренняя хатха-йога')).toBeInTheDocument();
    expect(within(historySection).queryByText('Утреннее плавание')).not.toBeInTheDocument();

    rerender(
      <AthleteProfilePage
        bookings={profileBookings.filter((booking) => booking.id !== 1)}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('0');
    expect(screen.queryByText('Активная запись учтена')).not.toBeInTheDocument();
    expect(screen.getByText('47% общего прогресса')).toBeInTheDocument();
    expect(screen.getByText('Первая запись на тренировку')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByTestId('athlete-summary-achievements')).toHaveTextContent('3');
    expect(
      within(screen.getByTestId('athlete-upcoming-section')).queryByText('Утреннее плавание'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Пока нет будущих записей. Новые бронирования появятся здесь после записи на занятия.',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('athlete-history-section')).getByText('1 завершено'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('athlete-history-section')).getByText('Утренняя хатха-йога'),
    ).toBeInTheDocument();
  });

  it('после create-like обновления поднимает progress summary и не смешивает активную запись с историей', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    const bookingsWithoutActiveBooking = profileBookings.filter((booking) => booking.id !== 1);
    const { rerender } = render(
      <AthleteProfilePage
        bookings={bookingsWithoutActiveBooking}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    const historySection = screen.getByTestId('athlete-history-section');

    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('0');
    expect(screen.queryByText('Активная запись учтена')).not.toBeInTheDocument();
    expect(screen.getByText('47% общего прогресса')).toBeInTheDocument();
    expect(screen.getByText('Первая запись на тренировку')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();
    expect(screen.getByTestId('athlete-summary-achievements')).toHaveTextContent('3');
    expect(within(historySection).getByText('1 завершено')).toBeInTheDocument();
    expect(within(historySection).getByText('Утренняя хатха-йога')).toBeInTheDocument();
    expect(within(historySection).queryByText('Утреннее плавание')).not.toBeInTheDocument();

    rerender(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('1');
    expect(screen.getByText('Активная запись учтена')).toBeInTheDocument();
    expect(screen.getByText('60% общего прогресса')).toBeInTheDocument();
    expect(screen.getByText('Первая запись на тренировку')).toBeInTheDocument();
    expect(screen.getByTestId('athlete-summary-achievements')).toHaveTextContent('4');
    expect(
      within(screen.getByTestId('athlete-upcoming-section')).getByText('Утреннее плавание'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('athlete-history-section')).getByText('1 завершено'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('athlete-history-section')).queryByText('Утреннее плавание'),
    ).not.toBeInTheDocument();
  });

  it('показывает notice и делает refresh при отмене записи из upcoming-карточки', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        success: true,
      }),
    );

    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    vi.useRealTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bookings/1',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    const deleteCall = fetchMock.mock.calls[0];

    expect(JSON.parse(deleteCall[1].body as string)).toEqual({
      userId: 1,
    });

    await waitFor(() => {
      expect(
        screen.getByText('Запись отменена. Блок ближайших занятий обновлён.'),
      ).toBeInTheDocument();
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('не ломает блок ачивок при отсутствии активности пользователя', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={[]}
        clubs={profileClubs}
        reviews={[]}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ачивки спортсмена' })).toBeInTheDocument();
    expect(screen.getByText('0% общего прогресса')).toBeInTheDocument();
    expect(
      screen.getByText('Пока нет открытых ачивок. Прогресс начнёт наполняться по мере активности.'),
    ).toBeInTheDocument();
    expect(screen.getByText('На спорте всерьёз')).toBeInTheDocument();
    expect(screen.getByText('0/10')).toBeInTheDocument();
  });

  it('показывает историю отдельно от будущих записей и связывает её с отзывами', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={historyBookings}
        clubs={historyClubs}
        reviews={profileReviews}
        schedule={historySchedule}
        trainers={historyTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'История' })).toBeInTheDocument();
    expect(screen.getByText('Персональная хатха-йога')).toBeInTheDocument();
    expect(screen.getByText('Бокс. Базовая техника')).toBeInTheDocument();
    expect(screen.getByText('Персональная тренировка')).toBeInTheDocument();
    expect(screen.getByText('Групповое занятие')).toBeInTheDocument();
    expect(screen.getByText('Отзыв уже оставлен')).toBeInTheDocument();
    expect(screen.getByText('Можно оставить отзыв')).toBeInTheDocument();
  });

  it('показывает пустое состояние блока истории, если завершённых занятий нет', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={[]}
        clubs={historyClubs}
        reviews={[]}
        schedule={historySchedule}
        trainers={historyTrainers}
        users={profileUsers}
      />,
    );

    expect(screen.getByRole('heading', { name: 'История' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'История пока пустая. Завершённые занятия и связанные отзывы появятся здесь автоматически.',
      ),
    ).toBeInTheDocument();
  });

  it('показывает избранные клубы и тренеров отдельным блоком', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    const favoritesSection = screen.getByTestId('athlete-favorites-section');
    const favoriteClubs = within(favoritesSection).getByTestId('athlete-favorite-clubs');
    const favoriteTrainers = within(favoritesSection).getByTestId('athlete-favorite-trainers');
    const favoriteClubsCard = within(favoritesSection).getByTestId('athlete-favorite-clubs-card');
    const favoriteTrainersCard = within(favoritesSection).getByTestId(
      'athlete-favorite-trainers-card',
    );

    expect(
      within(favoritesSection).getByRole('heading', { name: 'Избранное' }),
    ).toBeInTheDocument();
    expect(
      within(favoritesSection).getByRole('heading', { name: 'Избранные клубы' }),
    ).toBeInTheDocument();
    expect(
      within(favoritesSection).getByRole('heading', { name: 'Избранные тренеры' }),
    ).toBeInTheDocument();
    expect(favoriteClubsCard).toBeInTheDocument();
    expect(favoriteTrainersCard).toBeInTheDocument();
    expect(within(favoriteClubs).getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(within(favoriteClubs).getByText('Balance Yoga House')).toBeInTheDocument();
    expect(within(favoriteTrainers).getByText('Марина Соколова')).toBeInTheDocument();
    expect(within(favoriteTrainers).getByText('Анна Миронова')).toBeInTheDocument();
  });

  it('показывает пустое состояние блока избранного, если данных нет', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={[]}
        clubs={profileClubs}
        reviews={[]}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={[
          {
            ...profileUsers[0],
            favoriteClubIds: [],
          },
        ]}
      />,
    );

    const favoritesSection = screen.getByTestId('athlete-favorites-section');

    expect(
      within(favoritesSection).getByRole('heading', { name: 'Избранное' }),
    ).toBeInTheDocument();
    expect(
      within(favoritesSection).getByText(
        'Пока нет сохранённых клубов и тренеров. Этот блок заполнится по мере развития MVP-избранного.',
      ),
    ).toBeInTheDocument();
  });

  it('показывает отдельный блок отзывов и базовых настроек', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={profileReviews}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    const feedbackSection = screen.getByTestId('athlete-feedback-settings-section');
    const settingsBlock = within(feedbackSection).getByTestId('athlete-settings-block');
    const reviewsBlock = within(feedbackSection).getByTestId('athlete-reviews-block');

    /* Секции разделены: у каждой свой h2 заголовок */
    expect(
      within(settingsBlock).getByRole('heading', { name: 'Базовые настройки' }),
    ).toBeInTheDocument();
    expect(within(reviewsBlock).getByRole('heading', { name: 'Мои отзывы' })).toBeInTheDocument();
    expect(within(reviewsBlock).getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(within(reviewsBlock).getByText('Анна Миронова')).toBeInTheDocument();
    expect(within(reviewsBlock).getByText('Отзыв 1')).toBeInTheDocument();
    expect(within(reviewsBlock).getByText('Отзыв 3')).toBeInTheDocument();
    expect(within(settingsBlock).getByText('alexey@sporthub.local')).toBeInTheDocument();
    expect(within(settingsBlock).getByText('+7 (927) 000-10-10')).toBeInTheDocument();
    expect(within(settingsBlock).getByText('Zustand + localStorage')).toBeInTheDocument();
  });

  it('показывает пустое состояние отзывов и read-only настройки, если отзывов нет', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={[]}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    const feedbackSection = screen.getByTestId('athlete-feedback-settings-section');
    const reviewsBlock = within(feedbackSection).getByTestId('athlete-reviews-block');
    const settingsBlock = within(feedbackSection).getByTestId('athlete-settings-block');

    expect(
      within(reviewsBlock).getByText(
        'Ты ещё не оставлял отзывы. После новых оценок клубов и тренеров они появятся здесь.',
      ),
    ).toBeInTheDocument();
    expect(
      within(settingsBlock).getByText(
        'Редактирование профиля и настроек появится в следующих фазах.',
      ),
    ).toBeInTheDocument();
    expect(within(settingsBlock).getByText('Не добавлен')).toBeInTheDocument();
  });

  it('сворачивает отзывы до трёх и умеет раскрывать весь список', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });

    render(
      <AthleteProfilePage
        bookings={profileBookings}
        clubs={profileClubs}
        reviews={[
          ...profileReviews,
          {
            id: 4,
            createdAt: '2026-03-18T09:00:00.000Z',
            userId: 1,
            clubId: 1,
            rating: 4,
            text: 'Отзыв 4',
          },
        ]}
        schedule={profileSchedule}
        trainers={profileTrainers}
        users={profileUsers}
      />,
    );

    const reviewsBlock = screen.getByTestId('athlete-reviews-block');

    expect(within(reviewsBlock).getByText('Отзыв 4')).toBeInTheDocument();
    expect(within(reviewsBlock).getByText('Отзыв 1')).toBeInTheDocument();
    expect(within(reviewsBlock).getByText('Отзыв 2')).toBeInTheDocument();
    expect(within(reviewsBlock).queryByText('Отзыв 3')).not.toBeInTheDocument();

    fireEvent.click(within(reviewsBlock).getByRole('button', { name: 'Показать все отзывы' }));

    expect(within(reviewsBlock).getByText('Отзыв 3')).toBeInTheDocument();
    expect(within(reviewsBlock).getByRole('button', { name: 'Скрыть отзывы' })).toBeInTheDocument();

    fireEvent.click(within(reviewsBlock).getByRole('button', { name: 'Скрыть отзывы' }));

    expect(within(reviewsBlock).queryByText('Отзыв 3')).not.toBeInTheDocument();
    expect(
      within(reviewsBlock).getByRole('button', { name: 'Показать все отзывы' }),
    ).toBeInTheDocument();
  });
});
