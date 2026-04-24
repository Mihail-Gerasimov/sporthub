// Phase 26 Step 26.2: тесты фильтров групп и группировки по датам в
// NotificationsListPage. Проверяет 4 tab'а групп со счётчиками, фильтрацию
// по выбранной группе, toggle «Только непрочитанные» и рендер date-buckets
// (Сегодня / Вчера / Эта неделя / Раньше).
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/profile/athlete/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { AuthAccountType, Notification } from '@/types';

// Phase 27 Step 27.8: helper для настройки auth-сессии под нужную роль.
// NotificationsListPage теперь делает guard, сравнивая sessionAccountType с prop
// accountType. Без этого все тесты получают AccessDeniedCard.
function authenticateAs(accountType: AuthAccountType) {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: 1, name: 'Test User', email: 'test@sporthub.local' },
    accountType,
    isAuthenticated: true,
  });
}

// Фиксированное «сейчас» для детерминизма bucket'ов.
// 2026-04-22 = среда → понедельник текущей недели = 2026-04-20.
const NOW = new Date('2026-04-22T12:00:00.000Z');

// Phase 27 Step 27.3: фикстуры для provider — только provider-адресованные типы.
// Раньше в фикстурах смешивались athlete-типы (booking_confirmed, quarantine_start),
// теперь NotificationsListPage фильтрует их по accountType → все фикстуры — provider-типы.
const fixtures: Notification[] = [
  // Сегодня (2 штуки) — booking-ось провайдера + link, оба непрочитанные
  {
    id: 1,
    createdAt: '2026-04-22T10:00:00.000Z',
    userId: 1,
    type: 'booking_requested',
    payload: { bookingId: 501 },
  },
  {
    id: 2,
    createdAt: '2026-04-22T09:00:00.000Z',
    userId: 1,
    type: 'link_requested',
    payload: { linkId: 10 },
  },
  // Вчера — booking_cancelled_by_athlete_to_provider, прочитанное
  {
    id: 3,
    createdAt: '2026-04-21T10:00:00.000Z',
    userId: 1,
    type: 'booking_cancelled_by_athlete_to_provider',
    payload: { bookingId: 502 },
    readAt: '2026-04-21T15:00:00.000Z',
  },
  // Эта неделя (понедельник 2026-04-20) — booking_auto_expired_to_provider
  {
    id: 4,
    createdAt: '2026-04-20T10:00:00.000Z',
    userId: 1,
    type: 'booking_auto_expired_to_provider',
    payload: { bookingId: 503 },
  },
  // Раньше — link_revoked
  {
    id: 5,
    createdAt: '2026-03-15T10:00:00.000Z',
    userId: 1,
    type: 'link_revoked',
    payload: { linkId: 11 },
  },
];

// Athlete-фикстуры для теста, проверяющего quarantine-фильтр (у provider'а
// quarantine-уведомлений нет по дизайну).
const athleteFixtures: Notification[] = [
  {
    id: 10,
    createdAt: '2026-04-22T10:00:00.000Z',
    userId: 1,
    type: 'booking_confirmed',
    payload: { bookingId: 701 },
  },
  {
    id: 11,
    createdAt: '2026-04-22T09:00:00.000Z',
    userId: 1,
    type: 'quarantine_start',
    payload: { quarantineUntil: '2026-04-28T00:00:00.000Z' },
  },
];

describe('NotificationsListPage фильтры и группы (Step 26.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // По умолчанию — provider (4 из 6 тестов). Athlete-тесты переопределят ниже.
    authenticateAs('provider');
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит 4 таба групп со счётчиками по NOTIFICATION_TYPE_GROUP', () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} accountType="provider" />);

    // 3 booking (id=1, 3, 4) + 2 link (id=2, 5) + 0 quarantine = 5 total у провайдера
    expect(screen.getByTestId('notifications-filter-group-all')).toHaveTextContent(/Все/);
    expect(screen.getByTestId('notifications-filter-group-all')).toHaveTextContent('5');
    expect(screen.getByTestId('notifications-filter-group-booking')).toHaveTextContent(/Записи/);
    expect(screen.getByTestId('notifications-filter-group-booking')).toHaveTextContent('3');
    expect(screen.getByTestId('notifications-filter-group-links')).toHaveTextContent(/Связи/);
    expect(screen.getByTestId('notifications-filter-group-links')).toHaveTextContent('2');
    expect(screen.getByTestId('notifications-filter-group-quarantine')).toHaveTextContent(
      /Дисциплина/,
    );
    expect(screen.getByTestId('notifications-filter-group-quarantine')).toHaveTextContent('0');
  });

  it('выбор booking-фильтра оставляет только booking-уведомления', async () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} accountType="provider" />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-booking'));

    expect(screen.getByTestId('notification-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-3')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-4')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-5')).not.toBeInTheDocument();
  });

  // Phase 27 Step 27.3: quarantine-уведомления приходят только athlete'ам,
  // поэтому quarantine-фильтр проверяем в athlete-виде с локальными fixtures.
  it('выбор quarantine-фильтра оставляет только quarantine-уведомление (athlete)', async () => {
    authenticateAs('athlete');

    render(
      <NotificationsListPage notifications={athleteFixtures} userId={1} accountType="athlete" />,
    );

    fireEvent.click(screen.getByTestId('notifications-filter-group-quarantine'));

    expect(screen.getByTestId('notification-item-11')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-10')).not.toBeInTheDocument();
  });

  it('тоггл «Только непрочитанные» скрывает прочитанные', async () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} accountType="provider" />);

    // По умолчанию id=3 (прочитанное) виден
    expect(screen.getByTestId('notification-item-3')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notifications-toggle-unread'));

    // После включения тоггла — прочитанное id=3 исчезло, непрочитанное id=1 осталось
    expect(screen.queryByTestId('notification-item-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('notification-item-1')).toBeInTheDocument();
  });

  it('Phase 26 Step 26.8: для athlete tab `links` скрыт, booking+quarantine+all видны', () => {
    authenticateAs('athlete');

    render(<NotificationsListPage notifications={fixtures} userId={1} accountType="athlete" />);

    expect(screen.getByTestId('notifications-filter-group-all')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-quarantine')).toBeInTheDocument();
    expect(screen.queryByTestId('notifications-filter-group-links')).not.toBeInTheDocument();
  });

  it('рендерит date-buckets (today / yesterday / thisWeek / earlier) и распределяет уведомления', () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} accountType="provider" />);

    const today = screen.getByTestId('notifications-bucket-today');
    const yesterday = screen.getByTestId('notifications-bucket-yesterday');
    const thisWeek = screen.getByTestId('notifications-bucket-thisWeek');
    const earlier = screen.getByTestId('notifications-bucket-earlier');

    // id=1,2 — сегодня (booking_requested, link_requested)
    expect(today).toContainElement(screen.getByTestId('notification-item-1'));
    expect(today).toContainElement(screen.getByTestId('notification-item-2'));
    // id=3 — вчера (booking_cancelled_by_athlete_to_provider)
    expect(yesterday).toContainElement(screen.getByTestId('notification-item-3'));
    // id=4 — понедельник текущей недели (booking_auto_expired_to_provider)
    expect(thisWeek).toContainElement(screen.getByTestId('notification-item-4'));
    // id=5 — месяц назад (link_revoked)
    expect(earlier).toContainElement(screen.getByTestId('notification-item-5'));
  });
});
