// Счётчик надзора: значок в шапке и очередь во вкладке обязаны показывать
// ОДНО число (шаг 37.52).
//
// ⚠️ Почему этот набор нужен отдельно от человеческого паритета. Третий читатель
// счётчика — третье расхождение: ровно этим кончились фазы 35 и 36. С шага 37.50
// у служебной записи появился свой колокольчик, и читателей числа стало трое —
// значок, подпись раздела и пункт меню. Считать они обязаны одним способом,
// а проверить это можно только в ОДНОМ дереве: значок и лента рисуются рядом
// и сверяются два числа, которые видит человек.
//
// ⚠️ Главная опасность этого набора — зелень ПО СЛУЧАЙНОСТИ. У администратора
// ящик один, и стенд, в котором на любой адрес отвечает одна и та же лента,
// был бы зелёным при ЛЮБОЙ реализации: забудь колокольчик назвать ящик — он
// получил бы то же самое число. Поэтому в стенде ДВА разных ответа: надзорная
// очередь и человеческая лента с другим числом непрочитанных. Значок, сосчитавший
// человеческие строки, краснит набор.

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/service-portal/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

/** Служебная запись: кабинета у неё нет ни одного, ящик — общая очередь. */
const ADMIN_USER_ID = 9;

/** Очередь надзора: три не разобрано, одна разобрана. */
const SUPERVISION_FEED: Notification[] = [
  {
    id: 101,
    createdAt: '2026-09-11T10:00:00.000Z',
    addresseeKind: 'supervision',
    type: 'oversight_publication_hidden',
    payload: { subjectType: 'club', subjectId: 42 },
  },
  {
    id: 102,
    createdAt: '2026-09-11T09:00:00.000Z',
    addresseeKind: 'supervision',
    type: 'oversight_impersonation_started',
    payload: { subjectType: 'user', subjectId: 7 },
  },
  {
    id: 103,
    createdAt: '2026-09-10T18:00:00.000Z',
    addresseeKind: 'supervision',
    type: 'oversight_login_blocked',
    payload: { subjectType: 'user', subjectId: 8 },
  },
  {
    id: 104,
    createdAt: '2026-09-10T12:00:00.000Z',
    addresseeKind: 'supervision',
    type: 'oversight_publication_created',
    payload: { subjectType: 'trainer', subjectId: 5 },
  },
];

/**
 * Человеческая лента — та, что придёт на НЕназванный ящик.
 *
 * Непрочитанных в ней нарочно другое число: значок, спросивший не тот ящик,
 * покажет семёрку, и паритет покраснеет вместо того, чтобы сойтись случайно.
 */
const PERSONAL_UNREAD = 7;

const PERSONAL_FEED: Notification[] = Array.from({ length: PERSONAL_UNREAD }, (_, index) => ({
  id: 200 + index,
  createdAt: '2026-09-11T08:00:00.000Z',
  addresseeKind: 'personal' as const,
  userId: 1,
  type: 'booking_confirmed' as const,
  payload: { subjectType: 'booking', subjectId: 700 + index },
}));

/** Непрочитанные строки ленты — по правилу самой ленты, а не по стенду. */
function unreadOf(items: Notification[]): number {
  return items.filter((item) => item.readAt === undefined).length;
}

const RESOLVED_ROW_ID = 104;

/** Страница очереди, как её отдаёт сервер: строки плюс ЕГО счётчики. */
function supervisionPage() {
  const items = SUPERVISION_FEED.map((item) =>
    item.id === RESOLVED_ROW_ID
      ? { ...item, readAt: '2026-09-10T13:00:00.000Z', readByUserId: ADMIN_USER_ID }
      : item,
  );

  return { items, total: items.length, unreadCount: unreadOf(items) };
}

/**
 * Стенд: два РАЗНЫХ ответа на два разных ящика.
 *
 * Надзорный ящик называется параметром `scope=supervision`; всё остальное —
 * человеческая лента. Именно это различие и делает набор осмысленным.
 */
function installStand(): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const supervision = url.includes('scope=supervision');
    const page = supervisionPage();

    const body = url.includes('/api/notifications/unread-count')
      ? { unreadCount: supervision ? page.unreadCount : PERSONAL_UNREAD }
      : supervision
        ? page
        : { items: PERSONAL_FEED, total: PERSONAL_FEED.length, unreadCount: PERSONAL_UNREAD };

    return new Response(JSON.stringify({ success: true, data: body }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Число на значке. Значка нет — значит ноль. */
function badgeNumber(): number {
  const badge = screen.queryByTestId('notification-bell-badge');

  return badge === null ? 0 : Number(badge.textContent);
}

/** Строки очереди: все и неразобранные. */
const queuedRows = (): HTMLElement[] => screen.queryAllByTestId(/^supervision-item-\d+$/);
const unresolvedRows = (): HTMLElement[] =>
  screen.queryAllByTestId(/^supervision-item-unresolved-\d+$/);

/** Открыть панель: значок шапки и очередь рисуются ОДНИМ деревом. */
async function openPanel(): Promise<void> {
  installStand();

  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: ADMIN_USER_ID, name: 'Администратор', email: 'admin@sporthub.local' },
    accountKind: 'admin',
    isAdmin: true,
    isAuthenticated: true,
  });

  render(
    <>
      <NotificationBell />
      <AdminNotificationsPage initialFeed={supervisionPage()} />
    </>,
  );

  await flush();
}

describe('Очередь надзора: значок и лента считают одно и то же', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useNotificationsStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('на значке столько же, сколько неразобранных строк в очереди', async () => {
    await openPanel();

    // Главное утверждение набора: две цифры об одном ящике — одна в шапке,
    // другая глазами, в ленте.
    expect(badgeNumber()).toBe(unresolvedRows().length);
  });

  it('очередь показывает всё, что отдал сервер, — ни строкой меньше', async () => {
    await openPanel();

    // Вторая половина того же расхождения: разобранная строка в счётчик
    // не входит, но пропасть из очереди не должна — иначе «ноль и ноль»
    // сошлось бы на пустом экране.
    expect(queuedRows()).toHaveLength(supervisionPage().total);
  });

  it('число на значке — то, что прислал сервер, а не пересчёт браузера', async () => {
    await openPanel();

    expect(badgeNumber()).toBe(supervisionPage().unreadCount);
    expect(screen.getByTestId('supervision-unread-count')).toHaveTextContent(
      String(supervisionPage().unreadCount),
    );
  });

  it('значок НЕ считает человеческие строки: ящик у него надзорный', async () => {
    // ⚠️ Та самая защита от случайной зелени. Человеческая лента в стенде
    // отвечает другим числом; значок, спросивший неназванный ящик, покажет его.
    await openPanel();

    expect(badgeNumber()).not.toBe(PERSONAL_UNREAD);
    expect(queuedRows()).toHaveLength(SUPERVISION_FEED.length);
  });

  // ⚠️ Найдено ЭТИМ набором. Очередь читается страницами по пятнадцать строк,
  // а стор считает непрочитанные по тем строкам, что ему положили. Пока паритет
  // проверялся на очереди в одну страницу, оба числа совпадали случайно: смена
  // отбора на «разобрано» оставляла на экране ноль неразобранных — и значок
  // показывал ноль над очередью из двенадцати. Число знает сервер.
  describe('очередь длиннее страницы', () => {
    /** Страница из двух строк поверх очереди в сорок одну. */
    const LONG_QUEUE = { total: 41, unreadCount: 12 };

    function installLongStand(): void {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        const page = supervisionPage();
        // Отбор «разобрано» отдаёт страницу, на которой неразобранных нет вовсе —
        // а в очереди их по-прежнему двенадцать.
        const items = url.includes('readOnly')
          ? page.items.filter((item) => item.readAt !== undefined)
          : page.items;

        const body = url.includes('/api/notifications/unread-count')
          ? { unreadCount: LONG_QUEUE.unreadCount }
          : { items, ...LONG_QUEUE };

        return new Response(JSON.stringify({ success: true, data: body }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    }

    async function openLongPanel(): Promise<void> {
      installLongStand();

      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: { id: ADMIN_USER_ID, name: 'Администратор', email: 'admin@sporthub.local' },
        accountKind: 'admin',
        isAdmin: true,
        isAuthenticated: true,
      });

      render(
        <>
          <NotificationBell />
          <AdminNotificationsPage initialFeed={{ items: supervisionPage().items, ...LONG_QUEUE }} />
        </>,
      );

      await flush();
    }

    it('значок показывает число ОЧЕРЕДИ, а не число показанной страницы', async () => {
      await openLongPanel();

      expect(badgeNumber()).toBe(LONG_QUEUE.unreadCount);
      expect(screen.getByTestId('supervision-unread-count')).toHaveTextContent(
        String(LONG_QUEUE.unreadCount),
      );
    });

    it('смена отбора не сбивает значок на ноль', async () => {
      await openLongPanel();

      await act(async () => {
        screen.getByRole('button', { name: /^разобрано$/i }).click();
        await vi.advanceTimersByTimeAsync(0);
      });

      // На экране неразобранных строк не осталось — в очереди осталось двенадцать.
      expect(unresolvedRows()).toHaveLength(0);
      expect(badgeNumber()).toBe(LONG_QUEUE.unreadCount);
    });

    it('возврат строки в очередь прибавляет единицу, а не пересчитывает экран', async () => {
      await openLongPanel();

      await act(async () => {
        screen.getByTestId(`supervision-return-${RESOLVED_ROW_ID}`).click();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(badgeNumber()).toBe(LONG_QUEUE.unreadCount + 1);
    });
  });

  it('разбор строки убавляет значок сразу — считает тот же стор', async () => {
    await openPanel();

    const before = badgeNumber();

    await act(async () => {
      screen.getByTestId('supervision-resolve-101').click();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(badgeNumber()).toBe(before - 1);
    expect(badgeNumber()).toBe(unresolvedRows().length);
  });
});
