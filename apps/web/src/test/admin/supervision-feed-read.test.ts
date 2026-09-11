// Чтение очереди надзора со страницы служебной панели (шаг 37.42).
//
// ⚠️ Набор проверяет не «пришли ли данные», а ДВЕ вещи, каждая из которых
// однажды уже стоила дефекта.
//
// Первая — КАКОЕ ПОЛЕ ОТВЕТА читает постраничность. Прежняя редакция
// `getNotifications` брала из ответа только `items` и молча выбрасывала `total`
// с `unreadCount`. Это ровно форма дефекта фазы 36: счётчик публикаций, ждущих
// проверки, показывал вечный ноль, потому что читал `total` не оттуда. Тест
// компонента такое не ловит — он проверяет отрисовку числа, а не его источник.
//
// Вторая — КАКОЙ АДРЕС на самом деле дёргается. Ящик в запросе — это не украшение
// адреса: не названный ящик до шага 37.19 означал `?scope=all`, то есть ленту всей
// площадки в память, а с 37.19 означает отказ. Забыть его — самый дорогой промах
// этой работы, и на глаз он не виден: вызов выглядит обычным.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, toString: () => '' }),
}));

const { getNotifications, getUnreadNotificationsCount } = await import('@/lib/server-api');
const { SUPERVISION_MAILBOX, PERSONAL_MAILBOX } = await import('@/lib/notification-mailbox');

describe('чтение очереди надзора со страницы', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Настоящая форма ответа маршрута: счётчики лежат ВНУТРИ `data`. */
  const feedEnvelope = (data: unknown) =>
    new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  /** Адрес, который клиент дёрнул на самом деле. */
  const askedUrl = () => String(fetchMock.mock.calls[0][0]);

  it('возвращает КОНВЕРТ целиком, а не одни строки', async () => {
    fetchMock.mockResolvedValue(feedEnvelope({ items: [{ id: 7 }], total: 41, unreadCount: 12 }));

    const page = await getNotifications({ mailbox: SUPERVISION_MAILBOX, limit: 15 });

    // Постраничность считается от `total`, а не от длины выданной страницы:
    // страница — пятнадцать строк, очередь — сорок одна.
    expect(page.total).toBe(41);
    expect(page.unreadCount).toBe(12);
    expect(page.items).toHaveLength(1);
  });

  it('называет ящик надзора в адресе, а не умалчивает его', async () => {
    fetchMock.mockResolvedValue(feedEnvelope({ items: [], total: 0, unreadCount: 0 }));

    await getNotifications({ mailbox: SUPERVISION_MAILBOX });

    expect(askedUrl()).toContain('scope=supervision');
    // Режим «вся лента площадки» закрыт на сервере с шага 37.19 — и не должен
    // собираться здесь даже случайно.
    expect(askedUrl()).not.toContain('scope=all');
  });

  it('отбор уходит В ЗАПРОС: тема, состояние и срез страницы — параметрами', async () => {
    fetchMock.mockResolvedValue(feedEnvelope({ items: [], total: 0, unreadCount: 0 }));

    await getNotifications({
      mailbox: SUPERVISION_MAILBOX,
      group: 'oversight_catalog',
      unreadOnly: true,
      offset: 30,
      limit: 15,
    });

    const url = askedUrl();

    // Отбирать обязана база: страница в пятнадцать строк не может честно
    // отфильтровать очередь, которая растёт быстрее всех лент площадки.
    expect(url).toContain('group=oversight_catalog');
    expect(url).toContain('unreadOnly=true');
    expect(url).toContain('offset=30');
    expect(url).toContain('limit=15');
  });

  it('человеческие ящики называются по-прежнему — старые вызовы целы', async () => {
    // Тело ответа читается один раз, поэтому конверт собирается на каждый вызов.
    fetchMock.mockImplementation(async () => feedEnvelope({ items: [], total: 0, unreadCount: 0 }));

    await getNotifications({ userId: 5, mailbox: PERSONAL_MAILBOX });
    expect(askedUrl()).toContain('scope=personal');

    fetchMock.mockClear();
    await getNotifications({ userId: 5, mailbox: { kind: 'club', id: 12 } });
    expect(askedUrl()).toContain('clubId=12');

    fetchMock.mockClear();
    await getNotifications({ userId: 5, mailbox: { kind: 'trainer', id: 3 } });
    expect(askedUrl()).toContain('trainerId=3');
  });

  it('счётчик неразобранного спрашивает тот же ящик тем же именем', async () => {
    // ⚠️ Второго способа считать это число нет. Разойдясь с лентой хоть одним
    // условием, счётчик даёт «в пункте меню 3, в ленте 0» — это уже случалось
    // трижды за две фазы.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { unreadCount: 9 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(await getUnreadNotificationsCount(SUPERVISION_MAILBOX)).toBe(9);
    expect(askedUrl()).toContain('/notifications/unread-count?scope=supervision');
  });
});
