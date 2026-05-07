/**
 * Тесты dashboard admin-панели (Step 17.4).
 * Покрывают: рендер списка пользователей, текстовый поиск,
 * фильтрация по ролям и статусу, комбинированный поиск,
 * динамическое раскрытие фильтров, статистика, empty state.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '@/components/admin/DashboardPage';
import { AUTH_STORE_DEFAULT_STATE, MVP_ADMIN_USER_ID, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Trainer, User } from '@/types';

// Мокаем next/navigation. Phase 27 Step 27.15: refresh вынесен в именованный
// mock, чтобы можно было ассертить его вызов после impersonation start.
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
}));

// --- Фикстуры ---

const fixtureUsers: User[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'athlete',
    status: 'active',
    name: 'Алексей Смирнов',
    email: 'alexey@sporthub.local',
    phone: '+7 (927) 000-10-10',
    password: 'sporthub123',
    favoriteClubIds: [],
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'club_owner',
    status: 'active',
    name: 'Марина Крылова',
    email: 'marina@studio.local',
    phone: '+7 (927) 000-20-20',
    password: 'sporthub123',
    favoriteClubIds: [],
  },
];

const fixtureClubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Тестовый клуб',
    slug: 'test-club',
    description: 'Описание',
    shortDescription: 'Описание',
    city: 'Самара',
    address: 'ул. Тестовая, 1',
    phone: '+7 000 000 00 00',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [1],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 0,
    distanceKm: 0,
    managedByUserId: 2,
    source: 'provider',
    status: 'published',
  },
];

const fixtureTrainers: Trainer[] = [];

const fixtureBookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 1,
    offeringId: 1,
    ownerType: 'club',
    ownerId: 1,
    userId: 1,
    clubId: 1,
    sportId: 1,
    date: '2099-12-31',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1000,
  },
];

function renderDashboard(overrides?: {
  users?: User[];
  clubs?: Club[];
  trainers?: Trainer[];
  bookings?: Booking[];
}) {
  return render(
    <DashboardPage
      users={overrides?.users ?? fixtureUsers}
      clubs={overrides?.clubs ?? fixtureClubs}
      trainers={overrides?.trainers ?? fixtureTrainers}
      bookings={overrides?.bookings ?? fixtureBookings}
    />,
  );
}

describe('DashboardPage (Step 17.4)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: MVP_ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
      isAuthenticated: true,
      isAdmin: true,
    });
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  // --- Рендер списка пользователей ---

  it('показывает всех пользователей с ID, именем и ролью', () => {
    renderDashboard();

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
  });

  it('не показывает admin-пользователя в списке', () => {
    const usersWithAdmin: User[] = [
      ...fixtureUsers,
      {
        id: 3,
        createdAt: '2026-04-07T09:00:00.000Z',
        role: 'admin',
        status: 'active',
        name: 'Администратор',
        email: 'admin@sporthub.local',
        phone: '',
        password: 'admin',
        favoriteClubIds: [],
      },
    ];

    renderDashboard({ users: usersWithAdmin });

    expect(screen.queryByText('#3')).not.toBeInTheDocument();
    expect(screen.queryByText('Администратор')).not.toBeInTheDocument();
  });

  // --- Текстовый поиск ---

  it('текстовый поиск находит по имени', () => {
    renderDashboard();

    const searchInput = screen.getByPlaceholderText(/поиск/i);

    fireEvent.change(searchInput, { target: { value: 'Алексей' } });

    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.queryByText('Марина Крылова')).not.toBeInTheDocument();
  });

  it('текстовый поиск находит по email', () => {
    renderDashboard();

    const searchInput = screen.getByPlaceholderText(/поиск/i);

    fireEvent.change(searchInput, { target: { value: 'marina@' } });

    expect(screen.queryByText('Алексей Смирнов')).not.toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
  });

  it('текстовый поиск находит по ID', () => {
    renderDashboard();

    const searchInput = screen.getByPlaceholderText(/поиск/i);

    fireEvent.change(searchInput, { target: { value: '1' } });

    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
  });

  // --- Фильтр по ролям ---

  it('динамически раскрывает панель фильтров по кнопке', () => {
    renderDashboard();

    // Фильтры скрыты по умолчанию
    expect(screen.queryByLabelText(/^роль$/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));

    // Фильтры видны
    expect(screen.getByLabelText(/^роль$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/статус/i)).toBeInTheDocument();
  });

  it('фильтр по роли athlete показывает только спортсменов', () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));
    fireEvent.change(screen.getByLabelText(/^роль$/i), { target: { value: 'athlete' } });

    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.queryByText('Марина Крылова')).not.toBeInTheDocument();
  });

  it('фильтр по роли provider показывает только провайдеров', () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));
    fireEvent.change(screen.getByLabelText(/^роль$/i), { target: { value: 'provider' } });

    expect(screen.queryByText('Алексей Смирнов')).not.toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
  });

  // --- Комбинированный поиск ---

  it('комбинация текстового поиска и фильтра по роли сужает выборку', () => {
    renderDashboard();

    const searchInput = screen.getByPlaceholderText(/поиск/i);

    fireEvent.change(searchInput, { target: { value: '.local' } });

    // Оба пользователя содержат ".local" в email
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));
    fireEvent.change(screen.getByLabelText(/^роль$/i), { target: { value: 'athlete' } });

    // Только athlete
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.queryByText('Марина Крылова')).not.toBeInTheDocument();
  });

  // --- Статистика ---

  it('показывает статистику для athlete: количество активных записей', () => {
    renderDashboard();

    // Athlete id=1 имеет 1 active booking
    const athleteCard = screen.getByText('Алексей Смирнов').closest('article')!;

    expect(within(athleteCard).getByText(/активных записей/i)).toBeInTheDocument();
  });

  it('показывает статистику для provider: количество публикаций', () => {
    renderDashboard();

    // Provider id=2 имеет 1 club + 0 trainers = 1 публикация
    const providerCard = screen.getByText('Марина Крылова').closest('article')!;

    expect(within(providerCard).getByText(/публикаций/i)).toBeInTheDocument();
  });

  // --- Empty state ---

  it('показывает empty state когда нет результатов по фильтру', () => {
    renderDashboard();

    const searchInput = screen.getByPlaceholderText(/поиск/i);

    fireEvent.change(searchInput, { target: { value: 'несуществующий-запрос-xyz' } });

    expect(screen.getByText(/ничего не найдено|нет результатов/i)).toBeInTheDocument();
  });

  // --- Кнопка impersonation ---

  it('содержит кнопку «Войти как пользователь» в карточке', () => {
    renderDashboard();

    const buttons = screen.getAllByRole('button', { name: /войти как/i });

    expect(buttons.length).toBe(2);
  });

  // Phase 27 Step 27.15: после клика «Войти как» помимо router.push вызывается
  // router.refresh() — иначе RSC-кэш сегмента отрисует /profile/* со старым
  // userId, пользователю придётся вручную обновлять страницу.
  it('Step 27.15 — клик «Войти как» вызывает router.push И router.refresh', () => {
    renderDashboard();

    const buttons = screen.getAllByRole('button', { name: /войти как/i });
    fireEvent.click(buttons[0]);

    expect(mockPush).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });
});
