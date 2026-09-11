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
import type { Notification } from '@sporthub/types';

// ⚠️ Фаза 35: типов кабинета больше нет, и лента их не спрашивает — видимость
// строки решает её адресат. Обвязка осталась только ради входа: без вошедшего
// страница уводит на главную.
function authenticateAs() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: 1, name: 'Test User', email: 'test@sporthub.local' },
    accountKind: 'person',
    isAuthenticated: true,
  });
}

// Фиксированное «сейчас» для детерминизма bucket'ов.
// 2026-04-22 = среда → понедельник текущей недели = 2026-04-20.
const NOW = new Date('2026-04-22T12:00:00.000Z');

// ⚠️ Фаза 35: фикстуры больше не подбираются «под тип кабинета». Лента показывает
// то, что адресовано этому ящику, а тип строки на видимость не влияет.
const fixtures: Notification[] = [
  // Сегодня (2 штуки) — booking-ось провайдера + link, оба непрочитанные
  {
    id: 1,
    createdAt: '2026-04-22T10:00:00.000Z',
    userId: 1,
    type: 'booking_requested',
    payload: { subjectType: 'booking', subjectId: 501 },
  },
  {
    id: 2,
    createdAt: '2026-04-22T09:00:00.000Z',
    userId: 1,
    type: 'link_requested',
    payload: { subjectType: 'link', subjectId: 10 },
  },
  // Вчера — booking_cancelled_by_athlete_to_provider, прочитанное
  {
    id: 3,
    createdAt: '2026-04-21T10:00:00.000Z',
    userId: 1,
    type: 'booking_cancelled_by_athlete_to_provider',
    payload: { subjectType: 'booking', subjectId: 502 },
    readAt: '2026-04-21T15:00:00.000Z',
  },
  // Эта неделя (понедельник 2026-04-20) — booking_auto_expired_to_provider
  {
    id: 4,
    createdAt: '2026-04-20T10:00:00.000Z',
    userId: 1,
    type: 'booking_auto_expired_to_provider',
    payload: { subjectType: 'booking', subjectId: 503 },
  },
  // Раньше — link_revoked
  {
    id: 5,
    createdAt: '2026-03-15T10:00:00.000Z',
    userId: 1,
    type: 'link_revoked',
    payload: { subjectType: 'link', subjectId: 11 },
  },
];

// Athlete-фикстуры для теста, проверяющего фильтр группы «Отзывы» в athlete-виде:
// атлету приходит подтверждение публикации собственного отзыва.
const athleteFixtures: Notification[] = [
  {
    id: 10,
    createdAt: '2026-04-22T10:00:00.000Z',
    userId: 1,
    type: 'booking_confirmed',
    payload: { subjectType: 'booking', subjectId: 701 },
  },
  {
    id: 11,
    createdAt: '2026-04-22T09:00:00.000Z',
    userId: 1,
    type: 'review_published_for_athlete',
    payload: { reviewId: 801 },
  },
];

describe('NotificationsListPage фильтры и группы (Step 26.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // По умолчанию — provider (4 из 6 тестов). Athlete-тесты переопределят ниже.
    authenticateAs();
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит табы групп со счётчиками по NOTIFICATION_TYPE_GROUP', () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    // 3 booking (id=1, 3, 4) + 2 link (id=2, 5) + 0 отзывов = 5 total у провайдера
    expect(screen.getByTestId('notifications-filter-group-all')).toHaveTextContent(/Все/);
    expect(screen.getByTestId('notifications-filter-group-all')).toHaveTextContent('5');
    expect(screen.getByTestId('notifications-filter-group-booking')).toHaveTextContent(/Записи/);
    expect(screen.getByTestId('notifications-filter-group-booking')).toHaveTextContent('3');
    expect(screen.getByTestId('notifications-filter-group-links')).toHaveTextContent(/Связи/);
    expect(screen.getByTestId('notifications-filter-group-links')).toHaveTextContent('2');
    expect(screen.getByTestId('notifications-filter-group-reviews')).toHaveTextContent(/Отзывы/);
    expect(screen.getByTestId('notifications-filter-group-reviews')).toHaveTextContent('0');
  });

  it('выбор booking-фильтра оставляет только booking-уведомления', async () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-booking'));

    expect(screen.getByTestId('notification-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-3')).toBeInTheDocument();
    expect(screen.getByTestId('notification-item-4')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-5')).not.toBeInTheDocument();
  });

  // Phase 27 Step 27.3: подтверждение публикации отзыва приходит только атлету,
  // поэтому фильтр группы «Отзывы» проверяем в athlete-виде с локальными fixtures.
  it('выбор фильтра «Отзывы» оставляет только отзывное уведомление (athlete)', async () => {
    authenticateAs();

    render(<NotificationsListPage notifications={athleteFixtures} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-reviews'));

    expect(screen.getByTestId('notification-item-11')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-10')).not.toBeInTheDocument();
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

  // ⚠️ Шаг 35.28a. Прежде вкладка «Связи» пряталась у атлета: у роли атлета связей
  // не бывало. Ролей нет — у человека с клубом связи есть, — и вкладка обязана быть:
  // иначе её строки видно в «Все» и невозможно отфильтровать.
  it('вкладки — темы, а не роли: видны все три', () => {
    authenticateAs();

    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    expect(screen.getByTestId('notifications-filter-group-all')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-reviews')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-links')).toBeInTheDocument();
  });

  it('рендерит date-buckets (today / yesterday / thisWeek / earlier) и распределяет уведомления', () => {
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

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

  it('надзорная вкладка не показывается, пока нет её строк', () => {
    // ⚠️ Шаг 36.21 добавил четвёртую группу, и её единственный тип адресован
    // АДМИНИСТРАТОРУ. На этой странице администратора не бывает — она закрыта
    // `requirePerson()`, — и вкладка получалась вечно пустой у всех.
    //
    // Прятать её насовсем нельзя: строка, если она сюда попадёт, была бы видна
    // в «Все» и неотфильтровываема. Поэтому решают ДАННЫЕ, а не формула.
    render(<NotificationsListPage notifications={fixtures} userId={1} />);

    expect(screen.queryByTestId('notifications-filter-group-moderation')).not.toBeInTheDocument();
    // Прочие вкладки на месте: правило сузило ровно одну.
    expect(screen.getByTestId('notifications-filter-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-links')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-reviews')).toBeInTheDocument();
  });

  it('появилась надзорная строка — появилась и вкладка', () => {
    render(
      <NotificationsListPage
        notifications={[
          ...fixtures,
          {
            id: 9001,
            userId: 1,
            type: 'publication_recheck_requested',
            payload: { publicationName: 'Клуб' },
            createdAt: '2026-04-22T11:00:00.000Z',
          },
        ]}
        userId={1}
      />,
    );

    expect(screen.getByTestId('notifications-filter-group-moderation')).toBeInTheDocument();
  });
});
