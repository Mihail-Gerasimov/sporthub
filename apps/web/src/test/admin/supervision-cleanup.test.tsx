// Уборка очереди надзора: разбор, возврат в работу и удаление (шаг 37.48).
//
// ⚠️ Три вещи здесь не украшения, а требования, и каждое взялось из разбора.
//
// 1. «Отметить всё» гасит очередь ВСЕМ администраторам сразу. Поэтому действие
//    подтверждается, а отмена подтверждения не меняет НИ ОДНОЙ строки — иначе
//    диалог был бы декорацией поверх уже случившегося.
// 2. Разобранная строка НЕ исчезает. Она остаётся видимой под состоянием
//    «разобрано» с подписью, кто занялся: в общей очереди вопрос не «читал ли я»,
//    а «занялся ли этим кто-то и кто именно».
// 3. Возврат в очередь обязан существовать. Снятия разбора в проекте не было
//    нигде: ошибочный разбор был необратим для всей команды.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@sporthub/types';

const ADMIN_ID = 3;

function row(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    addresseeKind: 'supervision',
    type: 'oversight_impersonation_started',
    payload: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Notification;
}

/** Адреса, к которым ходил компонент. */
function askedUrls(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map((call) => String(call[0]));
}

function json(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Стенд отвечает ПО МАРШРУТУ, а не одним телом на всё.
 *
 * ⚠️ Прежде все запросы получали ответ уборки — `{ deleted: 1 }`, — включая
 * перезапрос ленты, который уборка и «отметить всё» делают сразу после себя.
 * В стор уезжало `undefined` вместо строк, и страница падала на `items.filter`:
 * восемь тестов оставались зелёными, а прогон выходил с ошибкой. Стенд, который
 * отвечает не тем, чем ответил бы сервер, проверяет не то приложение.
 */
async function defaultServer(url: unknown, init?: RequestInit): Promise<Response> {
  const address = String(url);

  if (init?.method === 'DELETE') return json({ deleted: 1 });
  if (address.includes('/read-all')) return json({ updatedCount: 1 });
  if (address.startsWith('/api/notifications?')) {
    return json({ items: [], total: 0, unreadCount: 0 });
  }

  // Разбор и возврат одной строки: важен только успех, тело не читается.
  return json({ ok: true });
}

describe('очередь надзора: уборка', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: ADMIN_ID, name: 'Admin', email: 'admin@sporthub.local' },
      isAuthenticated: true,
      isAdmin: true,
    });
    useNotificationsStore.getState().reset();

    fetchMock.mockReset();
    fetchMock.mockImplementation(defaultServer);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('разбор одной строки уходит на сервер и не прячет строку', async () => {
    render(
      <AdminNotificationsPage
        initialFeed={{ items: [row({ id: 5 })], total: 1, unreadCount: 1 }}
      />,
    );

    fireEvent.click(screen.getByTestId('supervision-resolve-5'));

    await waitFor(() => expect(askedUrls(fetchMock)).toContain('/api/notifications/5/read'));

    // Строка осталась на экране — под новым состоянием и с подписью «кто занялся».
    expect(await screen.findByTestId('supervision-item-resolved-5')).toHaveTextContent(
      `Разобрал #${ADMIN_ID}`,
    );
    expect(screen.getByTestId('supervision-item-5')).toBeInTheDocument();
  });

  it('«Отметить всё» СНАЧАЛА спрашивает, а отмена не трогает ни строки', async () => {
    render(
      <AdminNotificationsPage
        initialFeed={{ items: [row({ id: 6 }), row({ id: 7 })], total: 2, unreadCount: 2 }}
      />,
    );

    fireEvent.click(screen.getByTestId('supervision-mark-all'));

    // Само нажатие не должно ничего гасить — только открыть подтверждение.
    expect(screen.getByTestId('supervision-mark-all-confirm')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('supervision-mark-all-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('supervision-mark-all-confirm')).not.toBeInTheDocument(),
    );

    // Ни запроса, ни правки строк: отказ от подтверждения — это отказ от действия.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      useNotificationsStore.getState().notifications.every((item) => item.readAt === undefined),
    ).toBe(true);
  });

  it('подтверждённое «отметить всё» гасит ЯЩИК НАДЗОРА, а не чей-то личный', async () => {
    render(
      <AdminNotificationsPage
        initialFeed={{ items: [row({ id: 8 }), row({ id: 9 })], total: 2, unreadCount: 2 }}
      />,
    );

    fireEvent.click(screen.getByTestId('supervision-mark-all'));
    fireEvent.click(screen.getByTestId('supervision-mark-all-confirm'));

    await waitFor(() =>
      expect(askedUrls(fetchMock)).toContain('/api/notifications/read-all?scope=supervision'),
    );
  });

  it('после «отметить всё» счётчики спрашиваются заново, а не остаются прежними', async () => {
    // ⚠️ Без перезапроса подпись показывала бы «2 не разобрано» над очередью,
    // в которой не осталось ничего: счётчики приходят от сервера и сами
    // по нажатию кнопки не меняются.
    fetchMock.mockImplementation(async (url: unknown) =>
      String(url).includes('/read-all')
        ? new Response(JSON.stringify({ success: true, data: { updatedCount: 2 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(
            JSON.stringify({ success: true, data: { items: [], total: 2, unreadCount: 0 } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
    );

    render(
      <AdminNotificationsPage
        initialFeed={{ items: [row({ id: 15 }), row({ id: 16 })], total: 2, unreadCount: 2 }}
      />,
    );

    fireEvent.click(screen.getByTestId('supervision-mark-all'));
    fireEvent.click(screen.getByTestId('supervision-mark-all-confirm'));

    await waitFor(() =>
      expect(askedUrls(fetchMock).some((url) => url.includes('scope=supervision&'))).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByTestId('supervision-unread-count')).toHaveTextContent('0'),
    );
  });

  it('разобранную строку можно вернуть в очередь', async () => {
    render(
      <AdminNotificationsPage
        initialFeed={{
          items: [row({ id: 10, readAt: new Date().toISOString(), readByUserId: 12 })],
          total: 1,
          unreadCount: 0,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('supervision-return-10'));

    // ⚠️ Маршрута на сервере ПОКА нет — ожидание закреплено здесь, сторона API
    // дописывается отдельно. Без возврата ошибочный разбор необратим для всех.
    await waitFor(() => expect(askedUrls(fetchMock)).toContain('/api/notifications/10/unread'));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });

    // Строка снова в работе, и подпись разобравшего снята.
    expect(await screen.findByTestId('supervision-item-unresolved-10')).toBeInTheDocument();
  });

  it('отказ сервера на возврате возвращает строке разбор и подпись', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 500 }));

    render(
      <AdminNotificationsPage
        initialFeed={{
          items: [row({ id: 11, readAt: new Date().toISOString(), readByUserId: 12 })],
          total: 1,
          unreadCount: 0,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('supervision-return-11'));

    // Оптимистичная правка откатывается целиком: и разбор, и его подпись.
    expect(await screen.findByTestId('supervision-item-resolved-11')).toHaveTextContent(
      'Разобрал #12',
    );
  });

  it('удаление разобранных подтверждается и шлёт номера разобранных', async () => {
    render(
      <AdminNotificationsPage
        initialFeed={{
          items: [
            row({ id: 12 }),
            row({ id: 13, readAt: new Date().toISOString(), readByUserId: ADMIN_ID }),
          ],
          total: 2,
          unreadCount: 1,
        }}
      />,
    );

    // В кнопке видно, сколько строк уберётся: «удалить» без числа — обещание
    // неизвестного объёма.
    expect(screen.getByTestId('supervision-delete-resolved')).toHaveTextContent('(1)');

    fireEvent.click(screen.getByTestId('supervision-delete-resolved'));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('supervision-delete-confirm'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/notifications');
    expect(init).toMatchObject({ method: 'DELETE' });
    // Уходят номера ТОЛЬКО разобранных: неразобранная строка — это работа,
    // которую ещё никто не сделал.
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ ids: [13] });
  });

  it('ответ без строк признаётся неудачей, а не роняет раздел', async () => {
    // ⚠️ Не выдумка: ровно так отвечал прежний стенд этого файла, и раздел падал
    // на `items.filter` — в стор уезжало `undefined`. Восемь тестов при этом
    // оставались зелёными, потому что падение происходило ПОСЛЕ проверок,
    // необработанной ошибкой. Проверка формы ответа стоит у ленты кабинета
    // с самого начала; у очереди надзора её не было.
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (init?.method === 'DELETE') return json({ deleted: 1 });

      // Тело есть, признак успеха есть, строк нет — прежняя проверка пропускала.
      return json({ deleted: 1 });
    });

    render(
      <AdminNotificationsPage
        initialFeed={{
          items: [row({ id: 17, readAt: new Date().toISOString(), readByUserId: 12 })],
          total: 1,
          unreadCount: 0,
        }}
      />,
    );

    fireEvent.click(screen.getByTestId('supervision-delete-resolved'));
    fireEvent.click(screen.getByTestId('supervision-delete-confirm'));

    // Перезапрос после уборки получил тело не той формы — это неудача обновления.
    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((toast) => toast.message.includes('обновить очередь')),
      ).toBe(true),
    );

    // Раздел на месте и отрисован: при падении на `items.filter` от него
    // не осталось бы ничего — страницу снёс бы весь, вместе с управлением.
    expect(screen.getByTestId('supervision-state-filter')).toBeInTheDocument();
    expect(screen.getByTestId('supervision-group-tabs')).toBeInTheDocument();
  });

  it('удалять нечего — кнопка не обещает действия', () => {
    render(
      <AdminNotificationsPage
        initialFeed={{ items: [row({ id: 14 })], total: 1, unreadCount: 1 }}
      />,
    );

    expect(screen.getByTestId('supervision-delete-resolved')).toBeDisabled();
  });
});
