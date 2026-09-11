// Постраничность очереди надзора (шаг 37.47).
//
// ⚠️ Главная проверка здесь — ОТКУДА берётся число страниц. Считать его по длине
// выданной страницы нельзя: пятнадцать строк делятся на пятнадцать ровно всегда,
// и пагинатор показывал бы вечную «одну страницу» при любой длине очереди.
// Это форма дефекта фазы 36 — «счётчик читал число не оттуда», — и на глаз она
// не видна: первая страница выглядит правильно.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdminNotificationsPage,
  SUPERVISION_PAGE_SIZE,
} from '@/components/admin/AdminNotificationsPage';
import type { Notification } from '@sporthub/types';

/** Страница очереди из N строк. */
function page(count: number, total: number, unreadCount = total) {
  const items: Notification[] = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    addresseeKind: 'supervision',
    type: 'oversight_login_blocked',
    payload: {},
    createdAt: new Date().toISOString(),
  })) as Notification[];

  return { items, total, unreadCount };
}

describe('очередь надзора: постраничность', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, data: page(15, 41) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('число страниц считается от `total`, а не от длины страницы', () => {
    // 41 строка по 15 — три страницы. По выданной странице их было бы «одна».
    render(<AdminNotificationsPage initialFeed={page(15, 41)} />);

    expect(screen.getByRole('button', { name: 'Страница 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Страница 4' })).not.toBeInTheDocument();
  });

  it('пустая очередь оставляет ровно одну страницу', () => {
    render(<AdminNotificationsPage initialFeed={page(0, 0)} />);

    expect(screen.getByRole('button', { name: 'Страница 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Страница 2' })).not.toBeInTheDocument();
    expect(screen.getByTestId('supervision-page-range')).toHaveTextContent('Показано 0 из 0');
  });

  it('вторая страница приходит ЗАПРОСОМ со сдвигом, а не срезом выданного', async () => {
    render(<AdminNotificationsPage initialFeed={page(15, 41)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Страница 2' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const url = String(fetchMock.mock.calls[0][0]);

    expect(url).toContain(`offset=${SUPERVISION_PAGE_SIZE}`);
    expect(url).toContain(`limit=${SUPERVISION_PAGE_SIZE}`);
    // Ящик не теряется при листании — иначе вторая страница была бы чужой.
    expect(url).toContain('scope=supervision');
  });

  it('на первой странице «назад» недоступно, на последней — «вперёд»', async () => {
    // Ответ на листание несёт СВОЁ общее число: очередь общая, и к моменту
    // второго запроса коллега мог уже что-то разобрать.
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, data: page(15, 30) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    render(<AdminNotificationsPage initialFeed={page(15, 30)} />);

    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Страница 2' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('смена отбора возвращает на первую страницу', async () => {
    render(<AdminNotificationsPage initialFeed={page(15, 41)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Страница 3' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toContain('offset=30');

    // ⚠️ Иначе третья страница отбора, в котором страниц две, показала бы пустоту
    // и назвала бы её «событий нет».
    fireEvent.click(screen.getByRole('tab', { name: /каталог и модерация/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain('offset=0');
  });

  it('подпись показывает срез страницы, а не общее число дважды', () => {
    render(<AdminNotificationsPage initialFeed={page(15, 41)} />);

    expect(screen.getByTestId('supervision-page-range')).toHaveTextContent('1–15');
    expect(screen.getByTestId('supervision-page-range')).toHaveTextContent('41');
  });
});
