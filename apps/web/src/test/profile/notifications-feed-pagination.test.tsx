// Лента кабинета честна при ящике, который не влезает в одну страницу (шаг 37.59).
//
// ⚠️ Зачем набор. До этого шага лента получала массив строк пропом и отбирала его
// в памяти, а постраничности не было вовсе. Потолок выдачи маршрута — сто строк,
// поэтому у человека со ста пятьюдесятью уведомлениями отказ выглядел так:
// страница рисуется, список не пуст, числа на вкладках посчитаны — и всё это
// про первую сотню, а не про ящик. Ни одной ошибки, ни одного исключения.
//
// Здесь берётся ровно тот случай, на котором прежняя лента врала: полторы сотни.
// Проверяется не «сколько строк на экране» — строк на экране ровно столько,
// сколько прислал сервер, — а то, что ЧИСЛА взяты у сервера и что до остальных
// строк можно дойти ЗАПРОСОМ.
//
// Образец формы — очередь надзора (`test/admin/supervision-pagination.test.tsx`):
// у ленты кабинета и очереди надзора постраничность одна и та же, и заводить ей
// второе описание значило бы завести второе поведение.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/profile/me/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import {
  NOTIFICATIONS_PAGE_SIZE,
  NotificationsListPage,
} from '@/components/profile/notifications/NotificationsListPage';
import { PERSONAL_MAILBOX } from '@/lib/notification-mailbox';
import type { NotificationsFeedPage } from '@/lib/server-api';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

/** Сколько строк лежит в ящике. Полторы сотни — за потолком прежней выдачи. */
const MAILBOX_SIZE = 150;

/** Весь ящик: строки идут от свежих к старым, все непрочитанные. */
const MAILBOX: Notification[] = Array.from({ length: MAILBOX_SIZE }, (_, index) => ({
  id: index + 1,
  // Каждая строка на минуту старше предыдущей — порядок внутри ведра детерминирован.
  createdAt: new Date(Date.UTC(2026, 3, 22, 12, 0) - index * 60_000).toISOString(),
  addresseeKind: 'personal' as const,
  userId: 1,
  type: 'booking_confirmed' as const,
  payload: { subjectType: 'booking' as const, subjectId: 500 + index },
}));

/**
 * Сервер отвечает страницей: строки среза плюс счётчики ВСЕГО ящика.
 *
 * Именно так отвечает маршрут: `total` и `unreadCount` он считает запросом
 * к базе, а не по выданному срезу.
 */
function pageOf(offset: number, limit: number): NotificationsFeedPage {
  return {
    items: MAILBOX.slice(offset, offset + limit),
    total: MAILBOX_SIZE,
    unreadCount: MAILBOX_SIZE,
  };
}

/** Срез, который назвал адрес запроса. */
function offsetOf(url: string): number {
  return Number(new URL(url, 'http://local').searchParams.get('offset') ?? '0');
}

describe('Лента кабинета честна при 150 строках в ящике (37.59)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useNotificationsStore.getState().reset();
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 1, name: 'Test User', email: 'test@sporthub.local' },
      accountKind: 'person',
      isAuthenticated: true,
    });

    fetchMock.mockReset();
    // Заглушка отвечает тем срезом, который спросили: иначе «вторая страница
    // пришла запросом» проверялось бы по факту запроса, а не по его результату.
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      return new Response(
        JSON.stringify({ success: true, data: pageOf(offsetOf(url), NOTIFICATIONS_PAGE_SIZE) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  function openFeed() {
    return render(
      <NotificationsListPage
        initialFeed={pageOf(0, NOTIFICATIONS_PAGE_SIZE)}
        userId={1}
        mailbox={PERSONAL_MAILBOX}
      />,
    );
  }

  it('подпись называет число ЯЩИКА, а не длину показанной страницы', () => {
    openFeed();

    // Прежняя лента сказала бы «150» только потому, что показала бы 100 строк
    // и посчитала их же; при 150 в ящике это было бы «100».
    expect(screen.getByTestId('notifications-page-range')).toHaveTextContent(
      'Показано 1–20 из 150',
    );
  });

  it('непрочитанных показывает 150, а не потолок страницы', () => {
    openFeed();

    expect(screen.getByTestId('notifications-unread-count')).toHaveTextContent('150');
  });

  it('в колокольчик уходит число ящика, а не число страницы', () => {
    openFeed();

    // ⚠️ Стор общий с колокольчиком. `setNotifications` пересчитывает счётчик
    // по выданным строкам — на странице их двадцать, и без явной записи числа
    // сервера в шапке горело бы «20» над ящиком из ста пятидесяти.
    expect(useNotificationsStore.getState().unreadCount).toBe(150);
  });

  it('вторая страница приходит ЗАПРОСОМ, а не нарезкой выданного', async () => {
    openFeed();

    // Двадцать первой строки на первой странице нет — её неоткуда взять локально.
    expect(screen.queryByTestId('notification-item-21')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain('offset=20');

    expect(await screen.findByTestId('notification-item-21')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-page-range')).toHaveTextContent(
      'Показано 21–40 из 150',
    );
  });

  it('последняя страница ящика достижима', async () => {
    openFeed();

    // Восьмая страница: 150 строк по 20 — семь полных и хвост. Ряд номеров
    // сдвигается вслед за текущей страницей (максимум пять кнопок), поэтому
    // до восьмой доходим шагами — это и есть проверяемое поведение пагинатора.
    fireEvent.click(screen.getByRole('button', { name: 'Страница 5' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Страница 7' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Страница 8' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(String(fetchMock.mock.calls[2][0])).toContain('offset=140');
    expect(await screen.findByTestId('notification-item-150')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-page-range')).toHaveTextContent(
      'Показано 141–150 из 150',
    );
  });

  it('смена темы возвращает на первую страницу', async () => {
    openFeed();

    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('notifications-filter-group-links'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Остаться на второй странице отбора, в котором одна страница, — значит
    // показать пустоту и назвать её «нет уведомлений».
    const url = String(fetchMock.mock.calls[1][0]);

    expect(url).toContain('offset=0');
    expect(url).toContain('group=links');
  });

  it('число страниц считается от `total`, а не от длины выданной страницы', () => {
    openFeed();

    // Счёт по выданному дал бы вечную «одну страницу»: двадцать строк делятся
    // на двадцать ровно всегда, и кнопка «следующая» была бы выключена.
    expect(screen.getByRole('button', { name: 'Следующая страница' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Страница 5' })).toBeInTheDocument();
  });
});
