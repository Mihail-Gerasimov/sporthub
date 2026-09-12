/**
 * Phase 24 Step 24.7: NotificationBell — иконка уведомлений в Header'е.
 * Сценарии: скрыт для guest'а, badge с unreadCount, dropdown при клике,
 * ссылка «Все уведомления» ведёт в /profile/{athlete|provider}/notifications.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 27 Step 27.6: мок router.push наружу через hoisted — проверяем навигацию
// после клика по уведомлению в dropdown'е.
const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: routerPushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

import { NotificationBell } from '@/components/layout/NotificationBell';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

// Номера пользователей стенда: раньше приезжали константами из стора.
const ATHLETE_USER_ID = 1;
const PROVIDER_USER_ID = 2;
import type { Notification } from '@sporthub/types';

interface FetchRoutes {
  unreadCount?: number;
  items?: Notification[];
}

function mockFetchByRoute(routes: FetchRoutes = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/notifications/unread-count')) {
      return jsonResponse({
        success: true,
        data: { unreadCount: routes.unreadCount ?? 0 },
      });
    }
    if (url.includes('/api/notifications')) {
      const items = routes.items ?? [];
      return jsonResponse({
        success: true,
        data: { unreadCount: routes.unreadCount ?? 0, total: items.length, items },
      });
    }
    return jsonResponse({ success: false, error: 'route not mocked' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('NotificationBell', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    routerPushMock.mockReset();
  });

  it('не рендерится в гостевом состоянии', () => {
    mockFetchByRoute();

    const { container } = render(<NotificationBell />);

    expect(container).toBeEmptyDOMElement();
  });

  // ⚠️ Шаг 37.50. Прежнее обещание этого набора было обратным: «у служебной
  // записи колокольчика нет, уведомляться ей не о чем». Оно ПЕРЕВЁРНУТО, а не
  // удалено, и вот почему. Довод «не о чем» был верен ровно до фазы 37: у
  // администратора не бывает записей и отзывов, а больше уведомлять его было
  // нечем. Фаза 37 завела очередь надзора — общий ящик служебной записи, куда
  // приходят события, о которых не узнаёт ни пострадавший, ни второй
  // администратор. Уведомляться стало о чем, и молчащий колокольчик превратился
  // из верного поведения в потерю событий.
  //
  // Удалить проверку было нельзя: тогда снятие запрета никто бы не стерёг, и
  // возврат строки `accountKind === 'admin' → null` прошёл бы зелёным.
  it('у служебной записи колокольчик ЕСТЬ: ей адресована очередь надзора', async () => {
    mockFetchByRoute({ unreadCount: 4 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
      user: { id: 9, name: 'Администратор', email: 'admin@sporthub.local' },
    });

    render(<NotificationBell />);

    await flush();

    expect(screen.getByRole('button', { name: /уведомления/i })).toBeInTheDocument();
    expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('4');
  });

  it('у служебной записи «Все уведомления» ведут в служебную панель, а не в кабинет', async () => {
    // ⚠️ Ловушка 7 плана. `primaryCabinet` у администратора `null`, и адрес,
    // собранный от него, уезжал бы в `/profile/me/notifications`, откуда
    // `requirePerson()` выбрасывает на главную. Колокольчик «работал» бы,
    // а клик выкидывал из панели.
    mockFetchByRoute({ unreadCount: 0, items: [] });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
      user: { id: 9, name: 'Администратор', email: 'admin@sporthub.local' },
    });

    render(<NotificationBell />);

    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));

    await flush();

    expect(screen.getByRole('link', { name: 'Все уведомления' })).toHaveAttribute(
      'href',
      '/service-portal/notifications',
    );
  });

  it('выпадашка служебной записи спрашивает надзорный ящик, а не личную почту', async () => {
    // ⚠️ Ящик обязан быть НАЗВАН. Неназванный означает «всё моё», то есть личную
    // почту администратора, которой у него не бывает: выпадашка выглядела бы
    // рабочей и показывала бы вечную пустоту.
    const fetchMock = mockFetchByRoute({ unreadCount: 1, items: [] });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
      user: { id: 9, name: 'Администратор', email: 'admin@sporthub.local' },
    });

    render(<NotificationBell />);

    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));

    await flush();

    const listCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('/api/notifications?'),
    );

    expect(String(listCall?.[0])).toContain('scope=supervision');
  });

  it('счётчик служебной записи спрашивается тем же ящиком, что и лента', async () => {
    // ⚠️ Шаг 37.51. Значок, лента и вкладка обязаны считать ОДНИМ способом —
    // именно третий читатель с собственным правилом кончил фазы 35 и 36.
    const fetchMock = mockFetchByRoute({ unreadCount: 4 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
      user: { id: 9, name: 'Администратор', email: 'admin@sporthub.local' },
    });

    render(<NotificationBell />);

    await flush();

    const countCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/notifications/unread-count'),
    );

    expect(String(countCall?.[0])).toBe('/api/notifications/unread-count?scope=supervision');
  });

  it('счётчик человека спрашивается без ящика — прежнее поведение', async () => {
    const fetchMock = mockFetchByRoute({ unreadCount: 3 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      user: { id: PROVIDER_USER_ID, name: 'Марина Крылова', email: 'marina@studio.local' },
    });

    render(<NotificationBell />);

    await flush();

    const countCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/notifications/unread-count'),
    );

    expect(String(countCall?.[0])).toBe('/api/notifications/unread-count');
  });

  it('под работой от чужого лица показывает ленту ТОГО, от чьего лица работают', async () => {
    // ⚠️ Ловушка, названная планом заранее: различать надо по `accountKind`,
    // а НЕ по `isAdmin`. Под подменой `accountKind` становится `person`, а
    // `isAdmin` остаётся истинным — по нему администратор увидел бы свою
    // служебную ленту вместо ленты того, от чьего лица он работает.
    const fetchMock = mockFetchByRoute({ unreadCount: 0, items: [] });

    useAuthStore.setState({
      isAuthenticated: true,
      isAdmin: true,
      isImpersonating: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      user: { id: PROVIDER_USER_ID, name: 'Марина Крылова', email: 'marina@studio.local' },
    });

    render(<NotificationBell />);

    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));

    await flush();

    expect(screen.getByRole('link', { name: 'Все уведомления' })).toHaveAttribute(
      'href',
      '/profile/club/3/notifications',
    );

    // И ящик в запросе — тоже ящик того, от чьего лица работают: надзорного
    // `scope=supervision` здесь быть не должно ни при каком `isAdmin`.
    const listCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('/api/notifications?'),
    );

    expect(String(listCall?.[0])).not.toContain('supervision');
  });

  it('у человека без лиц услуг колокольчик на месте (ловушка 7.11)', async () => {
    mockFetchByRoute({ unreadCount: 3 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    expect(screen.getByRole('button', { name: /уведомления/i })).toBeInTheDocument();
    expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('3');
  });

  it('скрывает badge, если unreadCount = 0', async () => {
    mockFetchByRoute({ unreadCount: 0 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    expect(screen.queryByTestId('notification-bell-badge')).not.toBeInTheDocument();
  });

  it('по клику открывает dropdown с последними уведомлениями и ссылкой «Все уведомления» в личный кабинет', async () => {
    mockFetchByRoute({
      unreadCount: 2,
      items: [
        {
          id: 10,
          createdAt: '2026-04-20T12:00:00.000Z',
          addresseeKind: 'personal' as const,
          userId: ATHLETE_USER_ID,
          type: 'booking_confirmed',
          payload: { subjectType: 'booking', subjectId: 501 },
        },
        {
          id: 9,
          createdAt: '2026-04-19T12:00:00.000Z',
          addresseeKind: 'personal' as const,
          userId: ATHLETE_USER_ID,
          type: 'booking_rejected',
          payload: { subjectType: 'booking', subjectId: 502 },
        },
      ],
    });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));

    await flush();

    expect(screen.getByTestId('notification-bell-dropdown')).toBeInTheDocument();
    expect(screen.getByText(/бронирование подтверждено/i)).toBeInTheDocument();
    expect(screen.getByText(/бронирование отклонено/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Все уведомления' })).toHaveAttribute(
      'href',
      '/profile/me/notifications',
    );
  });

  it('у человека с лицом услуг ссылка «Все уведомления» ведёт в кабинет лица', async () => {
    mockFetchByRoute({ unreadCount: 0, items: [] });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      user: {
        id: PROVIDER_USER_ID,
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));

    await flush();

    expect(screen.getByRole('link', { name: 'Все уведомления' })).toHaveAttribute(
      'href',
      '/profile/club/3/notifications',
    );
    expect(screen.getByText(/нет новых уведомлений/i)).toBeInTheDocument();
  });

  // Phase 27 Step 27.6: клик по уведомлению в dropdown помечает прочитанным через
  // POST /api/notifications/[id]/read и переводит на полную страницу уведомлений.
  it('клик по непрочитанному уведомлению в dropdown шлёт POST /read и делает router.push', async () => {
    const fetchMock = mockFetchByRoute({
      unreadCount: 1,
      items: [
        {
          id: 42,
          createdAt: '2026-04-22T12:00:00.000Z',
          addresseeKind: 'personal' as const,
          userId: ATHLETE_USER_ID,
          type: 'booking_confirmed',
          payload: { subjectType: 'booking', subjectId: 777 },
        },
      ],
    });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();
    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));
    await flush();

    fireEvent.click(screen.getByTestId('notification-bell-item-42'));
    await flush();

    // POST без тела: владельца уведомления сервер берёт из сессии, а чужое
    // отвечает тем же «не найдено», что и несуществующее.
    const readCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/notifications/42/read'),
    );
    expect(readCall).toBeDefined();
    expect(readCall?.[1]).toEqual({ method: 'POST' });

    // И лента dropdown'а спрашивается без номера в адресе.
    const listCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('/api/notifications?'),
    );
    expect(String(listCall?.[0])).not.toContain('userId');

    // Навигация на полную страницу уведомлений.
    expect(routerPushMock).toHaveBeenCalledWith('/profile/me/notifications');

    // Dropdown закрылся.
    expect(screen.queryByTestId('notification-bell-dropdown')).not.toBeInTheDocument();
  });
});

// --- Найдено MCP-прогоном интерфейса: подпись значка --------------------------

describe('подпись колокольчика называет число непрочитанных', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  const asAdmin = () =>
    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
      user: { id: 9, name: 'Администратор', email: 'admin@sporthub.local' },
    });

  it('при непрочитанных подпись называет их количество', async () => {
    // ⚠️ Прежде диктор читал «Уведомления», а рядом стоял значок с цифрой,
    // ни к чему не привязанной: услышать «три» человек мог, а понять, что это
    // непрочитанные, — нет. В пункте меню панели это было сделано верно,
    // в колокольчике — нет. Ни один тест этого не ловил: на экране всё выглядело
    // правильно, врало дерево доступности. Нашёл MCP-прогон.
    mockFetchByRoute({ unreadCount: 3 });
    asAdmin();

    render(<NotificationBell />);
    await flush();

    expect(screen.getByRole('button', { name: /непрочитанных: 3/ })).toBeInTheDocument();
  });

  it('без непрочитанных подпись остаётся короткой', async () => {
    // Обратная сторона: «Уведомления, непрочитанных: 0» — шум, который диктор
    // читал бы на каждой странице.
    mockFetchByRoute({ unreadCount: 0, items: [] });
    asAdmin();

    render(<NotificationBell />);
    await flush();

    expect(screen.getByRole('button', { name: 'Уведомления' })).toBeInTheDocument();
  });
});
