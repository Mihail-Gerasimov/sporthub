// Быстрый переход из очереди надзора (шаг 37.53).
//
// ⚠️ Главное обещание набора — РАЗВЕДЕНИЕ двух действий. В ленте кабинета клик
// по строке с фазы 24 делает два дела разом: помечает прочитанной и уводит
// к предмету. В ОБЩЕЙ очереди это означало бы «пошёл посмотреть — объявил
// разобранным всей команде», причём необратимо для всех, кто её читает.
// Поэтому здесь переход уводит и ОСТАВЛЯЕТ строку в очереди, а разбор — своя
// кнопка. Диверсия «вернуть прежнее поведение» обязана краснить этот набор.
//
// ⚠️ Поведение человеческой ленты этим шагом НЕ меняется: там клик по-прежнему
// и уводит, и гасит. Разное поведение у двух лент — не недосмотр, а разные
// вопросы: «я это прочитал» и «этим занялись».

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/service-portal/notifications',
  useRouter: () => ({ push: routerPushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

const ADMIN_USER_ID = 9;

/** Строка про скрытую публикацию: предмет цел, открывать есть что. */
const HIDDEN_PUBLICATION: Notification = {
  id: 101,
  createdAt: '2026-09-11T10:00:00.000Z',
  addresseeKind: 'supervision',
  type: 'oversight_publication_hidden',
  payload: { subjectType: 'club', subjectId: 42, entityName: 'Volna Aquatic Club' },
};

/** Строка про нового тренера в каталоге — второй вид публикации. */
const NEW_TRAINER: Notification = {
  id: 102,
  createdAt: '2026-09-11T09:00:00.000Z',
  addresseeKind: 'supervision',
  type: 'oversight_publication_created',
  payload: { subjectType: 'trainer', subjectId: 5 },
};

/** Строка про человека: раздел людей наводки пока не принимает, но адрес есть. */
const IMPERSONATION: Notification = {
  id: 103,
  createdAt: '2026-09-11T08:00:00.000Z',
  addresseeKind: 'supervision',
  type: 'oversight_impersonation_started',
  payload: { subjectType: 'user', subjectId: 7 },
};

const FEED = [HIDDEN_PUBLICATION, NEW_TRAINER, IMPERSONATION];

function feedPage() {
  return { items: FEED, total: FEED.length, unreadCount: FEED.length };
}

/** Стенд: любой запрос отвечает той же очередью. */
function installStand(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = url.includes('/api/notifications/unread-count')
      ? { unreadCount: FEED.length }
      : feedPage();

    return new Response(JSON.stringify({ success: true, data: body }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function loginAsAdmin(): void {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: ADMIN_USER_ID, name: 'Администратор', email: 'admin@sporthub.local' },
    accountKind: 'admin',
    isAdmin: true,
    isAuthenticated: true,
  });
}

describe('Очередь надзора: быстрый переход к предмету', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    routerPushMock.mockReset();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useNotificationsStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('строка про публикацию уводит в модерацию ЭТОЙ публикации', async () => {
    installStand();
    loginAsAdmin();

    render(<AdminNotificationsPage initialFeed={feedPage()} />);
    await flush();

    // Вид в адресе стоит рядом с номером: клубы и карточки тренеров нумеруются
    // независимо, и клуб №42 — не тренер №42.
    expect(screen.getByTestId('supervision-open-101')).toHaveAttribute(
      'href',
      '/service-portal/moderation?type=club&id=42',
    );
    expect(screen.getByTestId('supervision-open-102')).toHaveAttribute(
      'href',
      '/service-portal/moderation?type=trainer&id=5',
    );
  });

  it('строка про человека уводит в раздел людей', async () => {
    installStand();
    loginAsAdmin();

    render(<AdminNotificationsPage initialFeed={feedPage()} />);
    await flush();

    expect(screen.getByTestId('supervision-open-103')).toHaveAttribute(
      'href',
      '/service-portal/dashboard',
    );
  });

  it('переход НЕ помечает строку разобранной', async () => {
    // ⚠️ Та самая диверсия: верни сюда прежнее поведение ленты кабинета — и набор
    // покраснеет сразу двумя утверждениями, запросом и состоянием строки.
    const fetchMock = installStand();
    loginAsAdmin();

    render(<AdminNotificationsPage initialFeed={feedPage()} />);
    await flush();

    fireEvent.click(screen.getByTestId('supervision-open-101'));
    await flush();

    const readCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/notifications/101/read'),
    );

    expect(readCall).toBeUndefined();
    expect(screen.getByTestId('supervision-item-unresolved-101')).toBeInTheDocument();
    expect(screen.queryByTestId('supervision-item-resolved-101')).not.toBeInTheDocument();
  });

  it('разбор остаётся отдельным действием и работает', async () => {
    // Контроль: без него «ничего не помечается» сошлось бы и у сломанной кнопки.
    const fetchMock = installStand();
    loginAsAdmin();

    render(<AdminNotificationsPage initialFeed={feedPage()} />);
    await flush();

    await act(async () => {
      screen.getByTestId('supervision-resolve-101').click();
      await vi.advanceTimersByTimeAsync(0);
    });

    const readCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/notifications/101/read'),
    );

    expect(readCall).toBeDefined();
  });

  it('колокольчик служебной записи уводит к предмету и тоже не разбирает строку', async () => {
    // Второе место, где клик делал два дела разом (`NotificationBell`), — и оно
    // разводится тем же правилом: очередь общая, разбор объявляется вслух.
    const fetchMock = installStand();
    loginAsAdmin();

    render(<NotificationBell />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));
    await flush();

    fireEvent.click(screen.getByTestId('notification-bell-item-101'));
    await flush();

    expect(routerPushMock).toHaveBeenCalledWith('/service-portal/moderation?type=club&id=42');
    expect(
      fetchMock.mock.calls.find(([url]) => String(url).includes('/api/notifications/101/read')),
    ).toBeUndefined();
  });

  it('колокольчик человека по-прежнему и помечает, и уводит в свою ленту', async () => {
    // ⚠️ Человеческая лента этим шагом НЕ меняется. Проверка стоит здесь же:
    // разведение действий сделано для ОБЩЕЙ очереди, и утечь в личный ящик
    // оно не имеет права.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const personal: Notification = {
        id: 501,
        createdAt: '2026-09-11T10:00:00.000Z',
        addresseeKind: 'personal',
        userId: 1,
        type: 'booking_confirmed',
        payload: { subjectType: 'booking', subjectId: 777 },
      };
      const body = url.includes('/api/notifications/unread-count')
        ? { unreadCount: 1 }
        : { items: [personal], total: 1, unreadCount: 1 };

      return new Response(JSON.stringify({ success: true, data: body }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 1, name: 'Алексей Смирнов', email: 'alexey@sporthub.local' },
      accountKind: 'person',
      isAuthenticated: true,
    });

    render(<NotificationBell />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));
    await flush();

    fireEvent.click(screen.getByTestId('notification-bell-item-501'));
    await flush();

    expect(
      fetchMock.mock.calls.find(([url]) => String(url).includes('/api/notifications/501/read')),
    ).toBeDefined();
    expect(routerPushMock).toHaveBeenCalledWith('/profile/me/notifications');
  });
});
