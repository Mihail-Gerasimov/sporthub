// Вкладки тем, тоггл непрочитанных и вёдра по дате в ленте кабинета.
//
// ⚠️ Шаг 37.59 переписал половину утверждений этого файла, и вот почему прежние
// больше не верны.
//
// Набор писался под ленту, которая получала массив строк пропом и отбирала его
// В ПАМЯТИ: «нажали вкладку — на экране остались только booking-строки». Пока
// фикстура короткая, такой тест зелен при обоих способах отбора, и именно поэтому
// дефект дожил до фазы 37: массив приходил страницей с потолком в сто строк,
// постраничности не было вовсе, и у человека с большой историей вкладка темы
// показывала не всё, что в этой теме есть, а только то, что попало в первую сотню.
// Числа на вкладках врали ровно так же.
//
// Теперь отбирает база. Проверять «что осталось на экране» стало бессмысленно:
// на экране ровно то, что прислал сервер, и утверждение про отрисовку зеленело бы
// и в том случае, если бы отбор вернулся в память. Поэтому здесь проверяется
// АДРЕС ЗАПРОСА и то, что ответ сервера доезжает до экрана нетронутым.
//
// Что осталось прежним: вёдра по дате (это не отбор — ни одна строка не теряется)
// и правило «вкладки — это темы, а не роли».
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/profile/me/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';
import { PERSONAL_MAILBOX } from '@/lib/notification-mailbox';
import type { NotificationsFeedPage } from '@/lib/server-api';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
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
    addresseeKind: 'personal' as const,
    userId: 1,
    type: 'booking_requested',
    payload: { subjectType: 'booking', subjectId: 501 },
  },
  {
    id: 2,
    createdAt: '2026-04-22T09:00:00.000Z',
    addresseeKind: 'personal' as const,
    userId: 1,
    type: 'link_requested',
    payload: { subjectType: 'link', subjectId: 10 },
  },
  // Вчера — booking_cancelled_by_athlete_to_provider, прочитанное
  {
    id: 3,
    createdAt: '2026-04-21T10:00:00.000Z',
    addresseeKind: 'personal' as const,
    userId: 1,
    type: 'booking_cancelled_by_athlete_to_provider',
    payload: { subjectType: 'booking', subjectId: 502 },
    readAt: '2026-04-21T15:00:00.000Z',
  },
  // Эта неделя (понедельник 2026-04-20) — booking_auto_expired_to_provider
  {
    id: 4,
    createdAt: '2026-04-20T10:00:00.000Z',
    addresseeKind: 'personal' as const,
    userId: 1,
    type: 'booking_auto_expired_to_provider',
    payload: { subjectType: 'booking', subjectId: 503 },
  },
  // Раньше — link_revoked
  {
    id: 5,
    createdAt: '2026-03-15T10:00:00.000Z',
    addresseeKind: 'personal' as const,
    userId: 1,
    type: 'link_revoked',
    payload: { subjectType: 'link', subjectId: 11 },
  },
];

/** Конверт ответа маршрута: строки плюс счётчики, которые считает сервер. */
function feedOf(items: Notification[]): NotificationsFeedPage {
  return {
    items,
    total: items.length,
    unreadCount: items.filter((item) => item.readAt === undefined).length,
  };
}

/** Адреса, которые лента запросила у сервера. */
function askedUrls(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map((call) => String(call[0]));
}

describe('Лента кабинета: вкладки тем, непрочитанные и вёдра по дате', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useNotificationsStore.getState().reset();
    authenticateAs();

    fetchMock.mockReset();
    // По умолчанию сервер отвечает пустой страницей: тесты, которым важен ответ,
    // переопределяют заглушку сами.
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, data: feedOf([]) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рисует вкладки тем БЕЗ чисел на них', () => {
    // ⚠️ Прежде здесь проверялись счётчики: «Записи 3», «Связи 2», «Отзывы 0».
    // Утверждение снято вместе с самими числами. Считать их браузеру не по чему:
    // у него страница, а не ящик, и число по странице — это ровно исправляемый
    // дефект. Сервер по темам сразу тоже не считает: `unreadCount` его ответа
    // сужается ВЫБРАННОЙ темой, а маршрута «сколько в каждой» нет. Выбор был
    // между числом с сервера, числом из памяти и отсутствием числа — первого нет,
    // второе лжёт. У очереди надзора чисел на вкладках нет по той же причине.
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    const bookingTab = screen.getByTestId('notifications-filter-group-booking');

    expect(bookingTab).toHaveTextContent(/Записи/);
    expect(bookingTab.textContent).not.toMatch(/\d/);
    expect(screen.getByTestId('notifications-filter-group-all').textContent).not.toMatch(/\d/);
  });

  it('вместо чисел на вкладках показывает числа СЕРВЕРА', () => {
    // Непрочитанные и «показано X из N» приходят из конверта ответа. Это и есть
    // замена вкладочным счётчикам: цифры остались, но за них отвечает тот,
    // у кого есть все строки.
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    expect(screen.getByTestId('notifications-unread-count')).toHaveTextContent('4');
    expect(screen.getByTestId('notifications-page-range')).toHaveTextContent('Показано 1–5 из 5');
  });

  it('смена вкладки меняет АДРЕС запроса, а не фильтрует выданное', async () => {
    // ⚠️ Главная переписанная проверка. Прежде утверждалось «на экране остались
    // только booking-строки» — и это зеленело при обоих способах отбора. Теперь
    // проверяется то, что различает способы: куда ушёл вопрос.
    render(
      <NotificationsListPage
        initialFeed={feedOf(fixtures)}
        userId={1}
        mailbox={PERSONAL_MAILBOX}
      />,
    );

    fireEvent.click(screen.getByTestId('notifications-filter-group-booking'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = askedUrls(fetchMock)[0];

    expect(url).toContain('group=booking');
    expect(url).toContain('scope=personal');
    expect(url).toContain('limit=20');
    expect(url).toContain('offset=0');
  });

  it('на монтировании лента не ходит второй раз за той же страницей', async () => {
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    await waitFor(() => expect(screen.getByTestId('notification-item-1')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('«Все» снимают отбор из адреса, а не добавляют условие', async () => {
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-reviews'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(askedUrls(fetchMock)[0]).toContain('group=reviews');

    fireEvent.click(screen.getByTestId('notifications-filter-group-all'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(askedUrls(fetchMock)[1]).not.toContain('group=');
  });

  it('на экране оказывается ровно то, что прислал сервер', async () => {
    // Вторая половина того же утверждения: браузер не досматривает ответ.
    // Сервер прислал строку темы «Связи» в ответ на вопрос про «Записи» —
    // она видна: спорить с сервером о принадлежности строки браузеру нечем.
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, data: feedOf([fixtures[1]]) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-booking'));

    expect(await screen.findByTestId('notification-item-2')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-item-1')).not.toBeInTheDocument();
  });

  it('тоггл «Только непрочитанные» тоже уходит В ЗАПРОС', async () => {
    // Прежде тоггл прятал прочитанные строки в памяти. Причина замены та же:
    // прятать можно только то, что уже выдано, а выдана одна страница.
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-toggle-unread'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(askedUrls(fetchMock)[0]).toContain('unreadOnly=true');

    fireEvent.click(screen.getByTestId('notifications-toggle-unread'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(askedUrls(fetchMock)[1]).not.toContain('unreadOnly');
  });

  it('тема и состояние спрашиваются вместе, а не по очереди', async () => {
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    fireEvent.click(screen.getByTestId('notifications-filter-group-links'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('notifications-toggle-unread'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Второй запрос обязан помнить и тему: отбор — одно условие, а не два экрана.
    const url = askedUrls(fetchMock)[1];

    expect(url).toContain('group=links');
    expect(url).toContain('unreadOnly=true');
  });

  // ⚠️ Шаг 35.28a. Прежде вкладка «Связи» пряталась у атлета: у роли атлета связей
  // не бывало. Ролей нет — у человека с клубом связи есть, — и вкладка обязана быть:
  // иначе её строки видно в «Все» и невозможно отфильтровать.
  it('вкладки — темы, а не роли: видны все три', () => {
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    expect(screen.getByTestId('notifications-filter-group-all')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-reviews')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-links')).toBeInTheDocument();
  });

  it('рендерит date-buckets (today / yesterday / thisWeek / earlier) и распределяет уведомления', () => {
    // Вёдра остались прежними и проверяются прежним утверждением: это НЕ отбор,
    // ни одна строка выданной страницы здесь не теряется — только раскладывается.
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

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

  it('надзорных вкладок в человеческой ленте нет вовсе', () => {
    // ⚠️ Переписано на новое обещание. Прежде вкладка надзора показывалась
    // «по данным» — появлялась, если в выданном массиве была хоть одна надзорная
    // строка, — и это утверждение проверялось с обеих сторон.
    //
    // С переходом отбора в запрос приём перестал работать по построению: страница
    // видит ОДНУ СТРАНИЦУ, и «нет строк на ней» не означает «нет строк в ящике».
    // Значит вкладка то появлялась бы, то исчезала при листании — хуже, чем
    // не появляться вовсе.
    render(<NotificationsListPage initialFeed={feedOf(fixtures)} userId={1} />);

    expect(
      screen.queryByTestId('notifications-filter-group-oversight_catalog'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('notifications-filter-group-oversight_admin'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('notifications-filter-group-oversight_security'),
    ).not.toBeInTheDocument();
    // Человеческие вкладки на месте: правило сузило ровно надзорные.
    expect(screen.getByTestId('notifications-filter-group-booking')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-links')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-filter-group-reviews')).toBeInTheDocument();
  });

  it('надзорная строка, если она сюда попадёт, ВИДНА — просто без своей вкладки', () => {
    // ⚠️ Замена прежнего «появилась надзорная строка — появилась и вкладка».
    // Довод, которым та вкладка держалась, был: «спрятать формулой нельзя, иначе
    // строка видна в «Все» и неотфильтровываема». Он остаётся в силе наполовину:
    // строка обязана быть ВИДНА, и она видна — отбора в памяти здесь больше нет,
    // лента показывает ровно то, что прислал сервер. Недоступно только сужение
    // по её теме, и это дешевле вкладки, пустой у всех и всегда.
    //
    // В норме такой строки не бывает: надзорная адресована очереди надзора,
    // владельца-человека у неё нет вовсе (`addressee_kind = 'supervision'`,
    // `user_id` пуст), а человеческий ящик отбирается по `userId`. Здесь она
    // подложена нарочно.
    render(
      <NotificationsListPage
        initialFeed={feedOf([
          ...fixtures,
          {
            id: 9001,
            addresseeKind: 'personal' as const,
            userId: 1,
            type: 'publication_recheck_requested',
            payload: { publicationName: 'Клуб' },
            createdAt: '2026-04-22T11:00:00.000Z',
          },
        ])}
        userId={1}
      />,
    );

    expect(screen.getByTestId('notification-item-9001')).toBeInTheDocument();
    expect(
      screen.queryByTestId('notifications-filter-group-oversight_catalog'),
    ).not.toBeInTheDocument();
  });
});
