import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import AthleteProfileRoute from '@/app/profile/athlete/page';
import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Club, Review, Schedule, Trainer } from '@/types';

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
    status: 'cancelled',
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
    amenities: [],
    tags: [],
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
    amenities: [],
    tags: [],
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
    sportId: 3,
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: 'Тренер по плаванию.',
    avatarUrl: '/images/trainers/marina.jpg',
    experienceYears: 9,
    specialties: ['Кроль'],
    rating: 4.9,
    reviewCount: 28,
    priceFrom: 1400,
  },
  {
    id: 5,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    sportId: 1,
    name: 'Анна Миронова',
    slug: 'anna-mironova',
    bio: 'Тренер по йоге.',
    avatarUrl: '/images/trainers/anna.jpg',
    experienceYears: 8,
    specialties: ['Йога'],
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

describe('AthleteProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

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
    expect(screen.getByText('alexey@sporthub.local')).toBeInTheDocument();
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
      />,
    );

    expect(screen.getByRole('heading', { name: 'Кабинет спортсмена' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Аватар Алексей Смирнов' })).toBeInTheDocument();
    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('1');
    expect(screen.getByTestId('athlete-summary-visits')).toHaveTextContent('1');
    expect(screen.getByTestId('athlete-summary-reviews')).toHaveTextContent('3');
    expect(screen.getByTestId('athlete-summary-achievements')).toHaveTextContent('3');
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
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ачивки спортсмена' })).toBeInTheDocument();
    expect(screen.getByText('Общий прогресс')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Открытые ачивки' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ачивки в процессе' })).toBeInTheDocument();
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
    expect(screen.getByText('Утреннее плавание')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByText('Подтверждена')).toBeInTheDocument();
    expect(screen.queryByText('Утренняя хатха-йога')).not.toBeInTheDocument();
    expect(screen.queryByText('Бокс. Базовая техника')).not.toBeInTheDocument();
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
      />,
    );

    expect(screen.getByRole('heading', { name: 'Предстоящие записи' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Пока нет будущих записей. Новые бронирования появятся здесь после записи на занятия.',
      ),
    ).toBeInTheDocument();
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
});
