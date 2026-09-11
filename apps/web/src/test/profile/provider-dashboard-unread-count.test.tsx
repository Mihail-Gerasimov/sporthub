// KPI «Непрочитанные» в кабинете лица — число приходит ЗАПРОСОМ (шаг 37.57).
//
// ⚠️ Зачем набор. Сводка кабинета считала непрочитанные фильтром по массиву
// `notifications`, а массив приходил страницей с потолком выдачи в сто строк.
// То есть после сотни уведомлений в ящике число молча занижалось: сто одно
// непрочитанное показывалось как сто, а полторы сотни — тоже как сто. Ошибка
// тихая: страница рисуется, ссылка работает, цифра просто меньше правды.
//
// Это прямое нарушение главного правила — счёт в памяти поверх обрезанной
// выдачи. Число обязан считать тот, у кого есть все строки, то есть база.
//
// ⚠️ И второе, ради чего здесь проверяется ПОДКЛЮЧЕНИЕ, а не отрисовка. В проекте
// трижды расходились лента и счётчик, потому что считали по-разному (ловушка 7.8
// фазы 35, шаг 36.50). Поэтому спрашивается ровно один адрес — тот же
// `/notifications/unread-count` с тем же ящиком, по которому человек увидит
// строки, перейдя в раздел уведомлений ЭТОГО кабинета.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

/** Кто вошёл: серверная страница узнаёт это только из сессии. */
const sessionUser = {
  id: 2,
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  accountKind: 'person' as const,
  capabilities: [],
  faces: [
    { kind: 'club' as const, id: 1, name: 'Volna Aquatic Club' },
    { kind: 'trainer' as const, id: 1, name: 'Марина Соколова' },
  ],
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'sh-session' ? { name, value: 'session-2' } : undefined),
    toString: () => 'sh-session=session-2',
  }),
}));

vi.mock('@/lib/session', () => ({
  readSession: async () => sessionUser,
  requireSession: async () => sessionUser,
  requirePerson: async () => sessionUser,
  requireOwner: async () => ({ user: sessionUser, face: sessionUser.faces[0] }),
  requireAdmin: async () => sessionUser,
}));

import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { clubFace, renderInFaceCabinet, trainerFace } from '@/test/helpers/cabinet';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import type { Notification } from '@sporthub/types';

import { WEB_ROOT } from '../web-root';

/** Потолок выдачи ленты: ровно он и занижал число до шага 37.57. */
const FEED_PAGE_LIMIT = 100;

/** Сто непрочитанных строк ящика клуба 1 — ровно страница выдачи, не больше. */
const cappedFeed: Notification[] = Array.from({ length: FEED_PAGE_LIMIT }, (_, index) => ({
  id: index + 1,
  createdAt: '2026-04-22T10:00:00.000Z',
  addresseeKind: 'club' as const,
  userId: 2,
  addresseeType: 'club' as const,
  addresseeId: 1,
  type: 'booking_requested',
  payload: { subjectType: 'booking' as const, subjectId: 500 + index },
}));

/** Адрес кабинета клуба 1 — тот же, что у остальных проверок кабинета лица. */
const clubParams = () => ({ params: Promise.resolve({ faceKind: 'club', faceId: '1' }) });

/** Адрес кабинета карточки тренера 1 — вторая половина «ящик назван верно». */
const trainerParams = () => ({ params: Promise.resolve({ faceKind: 'trainer', faceId: '1' }) });

/** Обращения к уведомлениям в порядке, в котором их сделала страница. */
const notificationCalls = (stub: ApiStub) =>
  stub.calls.filter((call) => call.startsWith('/notifications'));

describe('KPI «Непрочитанные» считается запросом (шаг 37.57)', () => {
  let stub: ApiStub;

  beforeEach(() => {
    // ⚠️ Сброса модулей здесь НЕТ намеренно: он завёл бы странице СВОЙ экземпляр
    // стора входа, а не тот, что наполняет набор. Сводка без человека в сторе
    // не рисуется вовсе, и проверка падала бы по чужой причине — не потому,
    // что число неверное, а потому, что рисовать нечего.
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: {
        id: 2,
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
      accountKind: 'person',
      isAuthenticated: true,
      status: 'ready',
      faces: sessionUser.faces,
    });
    stub = installApiStub({
      ...createFixtureRoutes(),
      // Лента отдаёт СТРАНИЦУ — сто строк, ровно потолок выдачи.
      '/notifications': { items: cappedFeed, total: 150, unreadCount: 150 },
      // А непрочитанных в ящике клуба полторы сотни: их знает только база.
      '/notifications/unread-count?clubId=1': { unreadCount: 150 },
      '/notifications/unread-count?trainerId=1': { unreadCount: 7 },
    });
  });

  afterEach(() => {
    stub.restore();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('при 150 непрочитанных показывает 150, а не потолок страницы', async () => {
    const { default: FaceDashboardRoute } =
      await import('@/app/profile/[faceKind]/[faceId]/dashboard/page');

    renderInFaceCabinet(await FaceDashboardRoute(clubParams()), clubFace(1, 'Volna Aquatic Club'));

    const card = screen.getByTestId('provider-dashboard-unread');

    expect(card).toHaveTextContent('150');
    // ⚠️ Именно так выглядел дефект: страница ленты кончилась — и число кончилось
    // вместе с ней. Проверка названа отдельно, чтобы падение читалось само.
    expect(
      card,
      'число совпало с потолком страницы — значит считается по массиву',
    ).not.toHaveTextContent(String(FEED_PAGE_LIMIT));
  });

  it('спрашивает счётчик ящика ОТКРЫТОГО кабинета, а не ленту человека', async () => {
    const { default: FaceDashboardRoute } =
      await import('@/app/profile/[faceKind]/[faceId]/dashboard/page');

    await FaceDashboardRoute(clubParams());

    const calls = notificationCalls(stub);

    expect(calls, 'сводка не сходила за числом непрочитанных').not.toEqual([]);
    expect(calls).toEqual(['/notifications/unread-count?clubId=1']);
  });

  it('в кабинете карточки тренера назван ящик этой карточки', async () => {
    const { default: FaceDashboardRoute } =
      await import('@/app/profile/[faceKind]/[faceId]/dashboard/page');

    renderInFaceCabinet(
      await FaceDashboardRoute(trainerParams()),
      trainerFace(1, 'Марина Соколова'),
    );

    expect(notificationCalls(stub)).toEqual(['/notifications/unread-count?trainerId=1']);
    expect(screen.getByTestId('provider-dashboard-unread')).toHaveTextContent('7');
  });

  it('сводка не считает непрочитанные сама: ленты она не видит вовсе', async () => {
    // ⚠️ Текстовый сторож фазы 37 — «ни один счётчик не считается поверх обрезанной
    // ленты». Поведенческие проверки выше ловят возврат счёта по массиву только
    // пока массив обрезан; сторож ловит сам ВОЗВРАТ — второй способ считать одно
    // и то же число. Массива у сводки нет, считать не из чего.
    const source = await readFile(
      path.join(WEB_ROOT, 'src/components/profile/provider/ProviderDashboard.tsx'),
      'utf8',
    );

    expect({ derivesFromFeed: /readAt/.test(source) }).toEqual({ derivesFromFeed: false });
    expect({ takesFeedProp: /notifications\s*[?:]/.test(source) }).toEqual({
      takesFeedProp: false,
    });
  });
});
