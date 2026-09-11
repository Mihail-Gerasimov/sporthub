// Тест ПОДКЛЮЧЕНИЯ тулбара очереди надзора (шаг 37.46).
//
// ⚠️ Проверяется не «отфильтровался ли список на экране», а КАКОЙ АДРЕС ушёл
// на сервер. Разница принципиальная: в человеческой ленте отбор по теме сделан
// в памяти поверх выданной страницы с потолком в сто строк. Для личного ящика
// это сходит с рук; для общей очереди, которая растёт быстрее всех лент площадки,
// такой отбор честен ровно до сто первой строки — и врать он будет молча,
// потому что на экране всё выглядит правильно.
//
// Тест, смотрящий на отрисованный список, зеленел бы в обоих случаях. Поэтому
// он смотрит на запрос.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';

const emptyFeed = { items: [], total: 0, unreadCount: 0 };

/** Адреса, которые компонент запросил у сервера. */
function askedUrls(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map((call) => String(call[0]));
}

describe('очередь надзора: отбор уходит в запрос', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, data: emptyFeed }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('на монтировании не ходит второй раз за той же страницей', async () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    // Эту страницу уже принёс сервер: повторный запрос был бы вторым походом
    // за тем же самым на КАЖДОМ открытии раздела.
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('смена темы меняет АДРЕС запроса, а не фильтрует выданное', async () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    fireEvent.click(screen.getByRole('tab', { name: /каталог и модерация/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = askedUrls(fetchMock)[0];

    expect(url).toContain('group=oversight_catalog');
    // Ящик называется всегда: без него запрос означал бы личную почту.
    expect(url).toContain('scope=supervision');
    expect(url).toContain('limit=15');
  });

  it('«Все темы» снимают отбор из адреса, а не добавляют условие', async () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    fireEvent.click(screen.getByRole('tab', { name: /доступ и вход/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('tab', { name: /^все$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(askedUrls(fetchMock)[1]).not.toContain('group=');
  });

  it('очередь открывается на неразобранном, и это видно по кнопке', () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    expect(screen.getByTestId('supervision-state-unresolved')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('supervision-state-all')).toHaveAttribute('aria-pressed', 'false');
  });

  it('смена состояния уходит В ЗАПРОС тремя разными адресами', async () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    fireEvent.click(screen.getByTestId('supervision-state-all'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // «Все» — это отсутствие условия, а не третье значение параметра.
    expect(askedUrls(fetchMock)[0]).not.toContain('unreadOnly');
    expect(askedUrls(fetchMock)[0]).not.toContain('readOnly');

    fireEvent.click(screen.getByTestId('supervision-state-resolved'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // ⚠️ Этого параметра маршрут ПОКА не понимает — на сервере есть только
    // `unreadOnly`. Ожидание закреплено здесь, сторона API дописывается отдельно.
    // Отбирать разобранные в памяти нельзя: это ровно тот дефект, ради которого
    // отбор и уезжал в запрос.
    expect(askedUrls(fetchMock)[1]).toContain('readOnly=true');

    fireEvent.click(screen.getByTestId('supervision-state-unresolved'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(askedUrls(fetchMock)[2]).toContain('unreadOnly=true');
  });

  it('тема и состояние спрашиваются вместе, а не по очереди', async () => {
    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    fireEvent.click(screen.getByRole('tab', { name: /действия администраторов/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('supervision-state-all'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // Второй запрос обязан помнить и тему: отбор — одно условие, а не два экрана.
    const url = askedUrls(fetchMock)[1];
    expect(url).toContain('group=oversight_admin');
    expect(url).not.toContain('unreadOnly');
  });

  it('ответ сервера обновляет и строки, и счётчики раздела', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  id: 77,
                  addresseeKind: 'supervision',
                  type: 'oversight_login_blocked',
                  payload: {},
                  createdAt: new Date().toISOString(),
                },
              ],
              total: 41,
              unreadCount: 12,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    render(<AdminNotificationsPage initialFeed={emptyFeed} />);

    fireEvent.click(screen.getByTestId('supervision-state-all'));

    // Счётчики приходят из ответа — их не пересчитывают по выданной странице.
    expect(await screen.findByTestId('supervision-item-77')).toBeInTheDocument();
    expect(screen.getByTestId('supervision-total-count')).toHaveTextContent('41');
    expect(screen.getByTestId('supervision-unread-count')).toHaveTextContent('12');
  });
});
