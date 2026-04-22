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
import type { Notification } from '@/types';

// Фиксированное «сейчас» для детерминизма bucket'ов.
// 2026-04-22 = среда → понедельник текущей недели = 2026-04-20.
const NOW = new Date('2026-04-22T12:00:00.000Z');

const fixtures: Notification[] = [
  // Сегодня (2 штуки) — booking + link, оба непрочитанные
  {
    id: 1,
    createdAt: '2026-04-22T10:00:00.000Z',
    userId: 1,
    type: 'booking_confirmed',
    payload: { bookingId: 501 },
  },
  {
    id: 2,
    createdAt: '2026-04-22T09:00:00.000Z',
    userId: 1,
    type: 'link_requested',
    payload: { linkId: 10 },
  },
  // Вчера — quarantine_start, прочитанное
  {
    id: 3,
    createdAt: '2026-04-21T10:00:00.000Z',
    userId: 1,
    type: 'quarantine_start',
    payload: { quarantineUntil: '2026-04-28T00:00:00.000Z' },
    readAt: '2026-04-21T15:00:00.000Z',
  },
  // Эта неделя (понедельник 2026-04-20) — booking_completed
  {
    id: 4,
    createdAt: '2026-04-20T10:00:00.000Z',
    userId: 1,
    type: 'booking_completed',
    payload: { bookingId: 502 },
  },
  // Раньше — booking_cancelled_by_provider
  {
    id: 5,
    createdAt: '2026-03-15T10:00:00.000Z',
    userId: 1,
    type: 'booking_cancelled_by_provider',
    payload: { bookingId: 503 },
  },
];

describe('NotificationsListPage фильтры и группы (Step 26.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('рендерит 4 таба групп со счётчиками по NOTIFICATION_TYPE_GROUP', () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    // 3 booking (id=1, 4, 5) + 1 link (id=2) + 1 quarantine (id=3) = 5 total
    expect(screen.getByTestId('notifications-filter-group-all')).toHaveTextContent(/Все/);
    expect(screen.getByTestId('notifications-filter-group-all')).toHaveTextContent('5');
    expect(screen.getByTestId('notifications-filter-group-booking')).toHaveTextContent(/Записи/);
    expect(screen.getByTestId('notifications-filter-group-booking')).toHaveTextContent('3');
    expect(screen.getByTestId('notifications-filter-group-links')).toHaveTextContent(/Связи/);
    expect(screen.getByTestId('notifications-filter-group-links')).toHaveTextContent('1');
    expect(screen.getByTestId('notifications-filter-group-quarantine')).toHaveTextContent(
      /Дисциплина/,
    );
    expect(screen.getByTestId('notifications-filter-group-quarantine')).toHaveTextContent('1');
  });

  it('выбор booking-фильтра оставляет только booking-уведомления', async () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-booking'));

    expect(screen.getByTestId('notification-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-4')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-5')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-3')).not.toBeInTheDocument();
  });

  it('выбор quarantine-фильтра оставляет только quarantine-уведомление', async () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-quarantine'));

    expect(screen.getByTestId('notification-item-3')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-2')).not.toBeInTheDocument();
  });

  it('тоггл «Только непрочитанные» скрывает прочитанные', async () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    // По умолчанию id=3 (прочитанное) виден
    expect(screen.getByTestId('notification-item-3')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notifications-toggle-unread'));

    // После включения тоггла — прочитанное id=3 исчезло, непрочитанное id=1 осталось
    expect(screen.queryByTestId('notification-item-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('notification-item-1')).toBeInTheDocument();
  });

  it('рендерит date-buckets (today / yesterday / thisWeek / earlier) и распределяет уведомления', () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    const today = screen.getByTestId('notifications-bucket-today');
    const yesterday = screen.getByTestId('notifications-bucket-yesterday');
    const thisWeek = screen.getByTestId('notifications-bucket-thisWeek');
    const earlier = screen.getByTestId('notifications-bucket-earlier');

    // id=1,2 — сегодня
    expect(today).toContainElement(screen.getByTestId('notification-item-1'));
    expect(today).toContainElement(screen.getByTestId('notification-item-2'));
    // id=3 — вчера
    expect(yesterday).toContainElement(screen.getByTestId('notification-item-3'));
    // id=4 — понедельник текущей недели
    expect(thisWeek).toContainElement(screen.getByTestId('notification-item-4'));
    // id=5 — месяц назад
    expect(earlier).toContainElement(screen.getByTestId('notification-item-5'));
  });
});
