/**
 * Тесты dashboard admin-панели (Step 17.4).
 * Покрывают: рендер списка пользователей, текстовый поиск,
 * фильтрация по ролям и статусу, комбинированный поиск,
 * динамическое раскрытие фильтров, статистика, empty state.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '@/components/admin/DashboardPage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Booking, Club, Trainer, User } from '@sporthub/types';

/**
 * Стенд сессии: маршрут имперсонизации отвечает согласием или отказом,
 * а личность стор перечитывает через «кто я».
 */
function stubSession(me: Record<string, unknown>, accepted = true) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: me }),
      } as unknown as Response);
    }

    return Promise.resolve({
      ok: accepted,
      status: accepted ? 200 : 403,
      json: () => Promise.resolve({ success: accepted }),
    } as unknown as Response);
  });
}

// Номера пользователей стенда. Раньше они приезжали константами из стора —
// фронт знал наперёд, кто атлет, провайдер и администратор. Теперь это просто
// данные теста.
const ADMIN_USER_ID = 3;

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
    status: 'active',
    name: 'Алексей Смирнов',
    email: 'alexey@sporthub.local',
    phone: '+7 (927) 000-10-10',
    passwordHash: 'sporthub123',
    favoriteClubIds: [],
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    status: 'active',
    name: 'Марина Крылова',
    email: 'marina@studio.local',
    phone: '+7 (927) 000-20-20',
    passwordHash: 'sporthub123',
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
      user: { id: ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
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
        accountKind: 'admin',
        status: 'active',
        name: 'Администратор',
        email: 'admin@sporthub.local',
        phone: '',
        passwordHash: 'admin',
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
    expect(screen.queryByLabelText(/лица услуг/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));

    // Фильтры видны
    expect(screen.getByLabelText(/лица услуг/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/статус/i)).toBeInTheDocument();
  });

  // ⚠️ Шаг 35.24. Отбор идёт по ВЛАДЕНИЮ лицами услуг, а не по роли: ролей нет,
  // и «провайдер» — это не признак у человека, а факт владения клубом или
  // карточкой тренера. Марина владеет клубом набора, Алексей — ничем.

  it('фильтр «без лиц услуг» показывает только тех, у кого их нет', () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));
    fireEvent.change(screen.getByLabelText(/лица услуг/i), { target: { value: 'without' } });

    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.queryByText('Марина Крылова')).not.toBeInTheDocument();
  });

  it('фильтр «с лицами услуг» показывает только владельцев', () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));
    fireEvent.change(screen.getByLabelText(/лица услуг/i), { target: { value: 'with' } });

    expect(screen.queryByText('Алексей Смирнов')).not.toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
  });

  // --- Комбинированный поиск ---

  it('комбинация текстового поиска и фильтра по лицам услуг сужает выборку', () => {
    renderDashboard();

    const searchInput = screen.getByPlaceholderText(/поиск/i);

    fireEvent.change(searchInput, { target: { value: '.local' } });

    // Оба пользователя содержат ".local" в email
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /фильтры/i }));
    fireEvent.change(screen.getByLabelText(/лица услуг/i), { target: { value: 'without' } });

    // Только тот, у кого лиц нет
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.queryByText('Марина Крылова')).not.toBeInTheDocument();
  });

  // --- Статистика ---

  it('у человека без лиц услуг показывает количество активных записей', () => {
    renderDashboard();

    // У пользователя 1 одна действующая запись и ни одного лица услуг.
    const athleteCard = screen.getByText('Алексей Смирнов').closest('article')!;

    expect(within(athleteCard).getByText(/активных записей/i)).toBeInTheDocument();
  });

  it('у владельца показывает количество лиц услуг', () => {
    renderDashboard();

    // У пользователя 2 один клуб и ни одной карточки тренера — одно лицо.
    const providerCard = screen.getByText('Марина Крылова').closest('article')!;

    expect(within(providerCard).getByText(/лиц услуг/i)).toBeInTheDocument();
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
  it('Step 27.15 — клик «Войти как» вызывает router.push И router.refresh', async () => {
    // ⚠️ Подмену выполняет СЕРВЕР, и уход со страницы ждёт его ответа: иначе
    // кабинет отрисовался бы под ещё не изменённой сессией.
    const fetchSpy = stubSession({
      id: 1,
      name: 'Алексей Смирнов',
      email: 'alexey@sporthub.local',
      capabilities: [],
      impersonating: true,
      actorName: 'Администратор SportHub',
    });

    renderDashboard();

    const buttons = screen.getAllByRole('button', { name: /войти как/i });
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/profile/athlete');
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/impersonate/1', { method: 'POST' });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('отказ сервера не уводит со страницы и говорит об этом', async () => {
    // Иначе администратор оказывался бы в чужом кабинете, которого сервер
    // всё равно не отдаст.
    stubSession({ id: 3, name: 'Админ', email: 'admin@sporthub.local' }, false);

    renderDashboard();

    fireEvent.click(screen.getAllByRole('button', { name: /войти как/i })[0]);

    await waitFor(() => {
      expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
        'Не удалось войти от лица пользователя',
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
