// Счётчик уведомлений: колокольчик и лента обязаны показывать ОДНО число.
//
// ⚠️ Ловушка 7.8 фазы 35 — «в колокольчике 3, в списке 0». Числа считают двое,
// и по разным правилам:
//   • колокольчик показывает число, присланное бэкендом (`unreadCount`), а тот
//     отбирает ленту по адресату и настройкам человека и про «кому адресован
//     тип» не знает ничего (`notifications.controller.ts`);
//   • лента прячет строки сама, в браузере, по формуле «тип уведомления → роль
//     человека» — `isNotificationTypeApplicable`, три независимых прохода
//     в `NotificationsListPage` (кнопка «отметить всё», счётчики вкладок,
//     сам список).
//
// Пока роль человека совпадала с «ролью» уведомления, числа сходились случайно.
// Фаза 35 роли убирает: смешанная лента — это обычный случай новой модели
// (человек с клубом, который сам ходит на занятия), а на ролях он был
// невозможен. Отказ при расхождении тихий: ошибок нет, исключений нет,
// у человека в колокольчике цифра, а в ленте пусто.
//
// Поэтому здесь не проверяется ни одна из сторон по отдельности — ни формула
// домена, ни ответ бэкенда. Колокольчик и лента рисуются в ОДНОМ дереве от
// ОДНОГО ответа бэкенда, и сверяются два числа, которые видит человек.
//
// ⚠️ На текущем коде в каждом из двух кабинетов краснеют две проверки из трёх,
// и это правильный цвет: сервер отдаёт смешанную ленту целиком, а лента
// показывает от неё половину. Зелёными они станут, когда адресатом станет лицо
// услуг (этап Э4) и правило останется одно — у сервера.

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/profile/provider/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { NotificationBell } from '@/components/layout/NotificationBell';
import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

/** Один человек: у него клуб, и он же сам ходит на занятия. */
const PERSON_ID = 2;

/**
 * Лента этого человека — ровно то, что лежит в его ящике.
 *
 * Три непрочитанных и одно прочитанное; два непрочитанных адресованы ему как
 * лицу услуг (заявка на запись, приглашение в клуб), одно — ему как человеку
 * (его запись подтвердили).
 */
const MIXED_FEED: Notification[] = [
  {
    id: 1,
    createdAt: '2026-04-22T10:00:00.000Z',
    userId: PERSON_ID,
    type: 'booking_requested',
    payload: { subjectType: 'booking', subjectId: 501 },
  },
  {
    id: 2,
    createdAt: '2026-04-22T09:00:00.000Z',
    userId: PERSON_ID,
    type: 'link_requested',
    payload: { subjectType: 'link', subjectId: 10 },
  },
  {
    id: 3,
    createdAt: '2026-04-21T18:00:00.000Z',
    userId: PERSON_ID,
    type: 'booking_confirmed',
    payload: { subjectType: 'booking', subjectId: 777 },
  },
  {
    id: 4,
    createdAt: '2026-04-20T12:00:00.000Z',
    userId: PERSON_ID,
    type: 'review_published_for_athlete',
    payload: { entityName: 'Volna Aquatic Club' },
    readAt: '2026-04-20T13:00:00.000Z',
  },
];

/** Однородная лента: всё адресовано человеку. Нужна как контроль. */
const PERSONAL_FEED: Notification[] = MIXED_FEED.filter(
  (notification) => notification.id === 3 || notification.id === 4,
);

/**
 * Ответ бэкенда на ленту человека — дословно по его правилу.
 *
 * `unreadCount` — непрочитанные ТОЙ ЖЕ ленты, которую он отдаёт: сервер
 * отбирает по адресату и отключённым типам, и оба числа считает по одному
 * и тому же условию запроса. Отдельного правила «кому адресован тип» у него нет.
 */
function serverAnswer(items: Notification[]): {
  items: Notification[];
  total: number;
  unreadCount: number;
} {
  return {
    items,
    total: items.length,
    unreadCount: items.filter((item) => item.readAt === undefined).length,
  };
}

/** Стенд: оба адреса счётчика отвечают из одного и того же ответа. */
function installFeedStub(items: Notification[]): void {
  const answer = serverAnswer(items);

  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = url.includes('/api/notifications/unread-count')
      ? { unreadCount: answer.unreadCount }
      : answer;

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

/** Число на колокольчике. Значка нет — значит ноль. */
function badgeNumber(): number {
  const badge = screen.queryByTestId('notification-bell-badge');

  return badge === null ? 0 : Number(badge.textContent);
}

/** Строки ленты: все и непрочитанные. Точка «непрочитано» — отдельный testid. */
const listedRows = (): HTMLElement[] => screen.queryAllByTestId(/^notification-item-\d+$/);
const listedUnreadRows = (): HTMLElement[] =>
  screen.queryAllByTestId(/^notification-item-unread-\d+$/);

/**
 * Открыть кабинет: колокольчик шапки и лента рисуются одним деревом.
 *
 * ⚠️ Шаги 35.34 и 35.24. Кабинет больше не выбирается «типом учётной записи»:
 * лента у человека одна, и что в ней показать, решает АДРЕСАТ уведомления,
 * а не то, кем человек записан. Поэтому и параметра здесь нет.
 */
async function openCabinet(feed: Notification[]): Promise<void> {
  installFeedStub(feed);

  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: PERSON_ID, name: 'Марина Крылова', email: 'marina@studio.local' },
    accountKind: 'person',
    isAuthenticated: true,
  });

  render(
    <>
      <NotificationBell />
      <NotificationsListPage notifications={feed} userId={PERSON_ID} />
    </>,
  );

  await flush();
}

describe('Уведомления: колокольчик и лента считают одно и то же', () => {
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

  // ⚠️ Прежде набор гонялся дважды — «кабинет лица услуг» и «личный кабинет», —
  // и различал их тип учётной записи. Пути кода при этом уже был один: адресат
  // уведомления решает всё сам (35.28a). Второй прогон проверял копию первого.
  describe('смешанная лента', () => {
    it('в колокольчике столько же, сколько непрочитанных строк в ленте', async () => {
      await openCabinet(MIXED_FEED);

      // Главное утверждение набора. Человек видит две цифры об одном и том же
      // ящике: одну в шапке, другую — глазами, в ленте. Разойтись они не могут.
      expect(badgeNumber()).toBe(listedUnreadRows().length);
    });

    it('лента показывает всё, что отдал сервер, — ни строкой меньше', async () => {
      await openCabinet(MIXED_FEED);

      // Вторая половина того же расхождения: прочитанные строки в счётчик
      // не входят, но пропасть из ленты тоже не должны. Без этой проверки
      // «в колокольчике 0, в списке 0» сошлось бы при пустом экране.
      expect(listedRows()).toHaveLength(serverAnswer(MIXED_FEED).total);
    });

    it('число в колокольчике — то, что прислал сервер, а не пересчёт клиента', async () => {
      await openCabinet(MIXED_FEED);

      // Подпорка под главное утверждение. Без неё расхождение «лечилось» бы
      // тем, что браузер считает ОБЕ цифры по своей формуле: на экране сошлось,
      // а сервер продолжает слать третью — и она вернётся первым же опросом
      // счётчика. Одно правило, и оно у сервера.
      expect(badgeNumber()).toBe(serverAnswer(MIXED_FEED).unreadCount);
    });
  });

  it('контроль: на однородной ленте числа сходятся уже сегодня', async () => {
    // Без контроля набор был бы красным по построению, и по нему нельзя было бы
    // понять, чинит ли что-нибудь очередная правка.
    await openCabinet(PERSONAL_FEED);

    expect(badgeNumber()).toBe(listedUnreadRows().length);
    expect(listedRows()).toHaveLength(serverAnswer(PERSONAL_FEED).total);
    expect(badgeNumber()).toBe(serverAnswer(PERSONAL_FEED).unreadCount);
  });
});
