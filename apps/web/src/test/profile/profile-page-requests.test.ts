// Какие запросы делают серверные страницы кабинетов.
//
// ⚠️ Это проверка шага 33.39a и главная защита от тихой поломки. Раньше каждая
// страница кабинета забирала ПОЛНЫЙ срез записей площадки и отбирала своё уже
// в браузере. Теперь отбор уходит в запрос, а значит появляется новый способ
// сломаться незаметно: спросить не тот срез. Страница с недобранными записями
// выглядит рабочей — просто цифры меньше.
//
// Поэтому здесь проверяются не картинки, а адреса, по которым страница сходила.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';

/** Кто вошёл. Серверная страница узнаёт это только из сессии. */
let signedInUserId: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'sh-session' && signedInUserId !== undefined
        ? { name, value: `session-${signedInUserId}` }
        : undefined,
    toString: () => (signedInUserId === undefined ? '' : `sh-session=session-${signedInUserId}`),
  }),
}));

// ⚠️ Сессию подменяем целиком, а не заголовок cookie: `requireRole` спрашивает
// бэкенд «кто я», а этот набор проверяет НЕ вход, а адреса, по которым страница
// сходила за данными. Настоящую проверку входа держат тесты бэкенда и отдельный
// набор про серверные guard'ы.
vi.mock('@/lib/session', () => ({
  readSession: async () =>
    signedInUserId === undefined
      ? null
      : { id: Number(signedInUserId), name: 'Тест', email: 't@test.local', role: 'club_owner' },
  requireSession: async () => ({
    id: Number(signedInUserId ?? 2),
    name: 'Тест',
    email: 't@test.local',
    role: 'club_owner',
  }),
  requireRole: async () => ({
    id: Number(signedInUserId ?? 2),
    name: 'Тест',
    email: 't@test.local',
    role: 'club_owner',
  }),
}));

/** Запросы записей, которые сделала страница. */
const bookingCalls = (stub: ApiStub) => stub.calls.filter((call) => call.startsWith('/bookings'));

describe('Запросы серверных страниц кабинетов', () => {
  let stub: ApiStub;

  beforeEach(() => {
    vi.resetModules();
    stub = installApiStub(createFixtureRoutes());
  });

  afterEach(() => {
    stub.restore();
    signedInUserId = undefined;
  });

  describe('кабинет атлета', () => {
    it('спрашивает записи только своего атлета', async () => {
      signedInUserId = '1';
      const { default: AthleteScheduleRoute } = await import('@/app/profile/athlete/schedule/page');

      await AthleteScheduleRoute();

      expect(bookingCalls(stub)).toEqual(['/bookings?userId=1']);
    });

    it('у гостя записей не спрашивает вовсе', async () => {
      const { default: AthleteScheduleRoute } = await import('@/app/profile/athlete/schedule/page');

      await AthleteScheduleRoute();

      expect(bookingCalls(stub)).toEqual([]);
    });
  });

  describe('кабинет провайдера', () => {
    it('спрашивает записи каждой своей публикации и ни одной чужой', async () => {
      // Провайдер 2 управляет клубами 1 и 2 и тренерами 1, 3, 5.
      signedInUserId = '2';
      const { default: ProviderStatsRoute } = await import('@/app/profile/provider/stats/page');

      await ProviderStatsRoute();

      expect(bookingCalls(stub).sort()).toEqual([
        '/bookings?scope=all&clubId=1',
        '/bookings?scope=all&clubId=2',
        '/bookings?scope=all&trainerId=1',
        '/bookings?scope=all&trainerId=3',
        '/bookings?scope=all&trainerId=5',
      ]);
    });

    it('у гостя записей не спрашивает вовсе', async () => {
      const { default: ProviderStatsRoute } = await import('@/app/profile/provider/stats/page');

      await ProviderStatsRoute();

      expect(bookingCalls(stub)).toEqual([]);
    });

    it('макет спрашивает то же самое, что и страница, и ничего сверх', async () => {
      signedInUserId = '2';
      const { default: ProviderProfileLayout } = await import('@/app/profile/provider/layout');

      await ProviderProfileLayout({ children: null });

      // Макет решает по записям, показывать ли раздел «Записи», — и ему нужен
      // ровно тот же срез, что и странице. Отсюда общий загрузчик.
      expect(bookingCalls(stub).sort()).toEqual([
        '/bookings?scope=all&clubId=1',
        '/bookings?scope=all&clubId=2',
        '/bookings?scope=all&trainerId=1',
        '/bookings?scope=all&trainerId=3',
        '/bookings?scope=all&trainerId=5',
      ]);
    });

    it('ни макет, ни страницы не ходят за записями мимо общего загрузчика', async () => {
      // ⚠️ Это и есть гарантия «поход один за навигацию». Макет и страница раздела
      // рендерятся в ОДНОМ запросе, и общий загрузчик обёрнут в `cache` из React —
      // он держит их одним походом. Работает это ровно до тех пор, пока обе стороны
      // ходят через него; собственный вызов клиента у любой из них немедленно вернул
      // бы второй поход. Проверить сам `cache` здесь нечем: он мемоизирует внутри
      // рендера Next, а тут функции маршрутов вызываются напрямую. Поэтому стережём
      // то, что проверяемо, — отсутствие обходных путей.
      const files = [
        'src/app/profile/provider/layout.tsx',
        'src/app/profile/provider/dashboard/page.tsx',
        'src/app/profile/provider/stats/page.tsx',
        'src/app/profile/provider/bookings/page.tsx',
        'src/app/profile/provider/clients/page.tsx',
      ];

      for (const file of files) {
        const text = await readFile(path.join(process.cwd(), file), 'utf8');

        expect({ file, usesLoader: /loadProviderScope/.test(text) }).toEqual({
          file,
          usesLoader: true,
        });
        expect({ file, bypasses: /getBookings\w*\(/.test(text) }).toEqual({
          file,
          bypasses: false,
        });
      }
    });

    it('обзор берёт уведомления своего пользователя, а не ленту всей площадки', async () => {
      signedInUserId = '2';
      const { default: ProviderDashboardRoute } =
        await import('@/app/profile/provider/dashboard/page');

      await ProviderDashboardRoute();

      // ⚠️ Обзору нужно ОДНО число — сколько у провайдера непрочитанных. Раньше ради
      // него запрашивалась лента ВСЕЙ площадки (`scope=all`) и фильтровалась в памяти:
      // цена страницы росла вместе с числом уведомлений всех пользователей сразу.
      const notificationCalls = stub.calls.filter((call) => call.startsWith('/notifications'));

      expect(notificationCalls.some((url) => url.includes('userId=2'))).toBe(true);
      expect(notificationCalls.some((url) => url.includes('scope=all'))).toBe(false);
    });

    it('раздел клиентов дополнительно берёт историю клиентов — но не весь срез', async () => {
      signedInUserId = '2';
      const { default: ProviderClientsRoute } = await import('@/app/profile/provider/clients/page');

      await ProviderClientsRoute();

      // Бейдж надёжности клиента считается по всей его истории, поэтому к записям
      // публикаций добавляется срез по трём статусам из восьми — тем, которые
      // читает расчёт. Полного среза площадки среди запросов быть не должно.
      const calls = bookingCalls(stub);
      expect(calls).toContain(
        '/bookings?scope=all&status=completed%2Cno_show%2Ccancelled_by_athlete',
      );
      expect(calls).not.toContain('/bookings?scope=all');
    });
  });
});
