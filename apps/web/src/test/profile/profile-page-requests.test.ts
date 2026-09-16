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

import { WEB_ROOT } from '../web-root';

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

// ⚠️ Сессию подменяем целиком, а не заголовок cookie: проверки страницы ходят
// на бэкенд с вопросом «кто я», а этот набор проверяет НЕ вход, а адреса,
// по которым страница сходила за данными. Настоящую проверку входа держат тесты
// бэкенда и отдельный набор про серверные guard'ы.
//
// ⚠️ Фаза 35, шаг 35.34. У сессии появились `accountKind` и `faces`, и второе
// здесь обязательно: кабинет лица пускает по наличию лица, а не по имени роли.
// Без этого поля лейаут падал бы на пустом месте — и падал бы молча, потому что
// адреса запросов при этом остаются «правильными».
const sessionUser = () => ({
  id: Number(signedInUserId ?? 2),
  name: 'Тест',
  email: 't@test.local',
  role: 'club_owner' as const,
  accountKind: 'person' as const,
  capabilities: [],
  faces: [{ kind: 'club' as const, id: 1, name: 'Volna Aquatic Club' }],
});

vi.mock('@/lib/session', () => ({
  readSession: async () => (signedInUserId === undefined ? null : sessionUser()),
  requireSession: async () => sessionUser(),
  requirePerson: async () => sessionUser(),
  // ⚠️ Шаг 35.31: проверка владения отдаёт САМО ЛИЦО, а не только человека.
  requireOwner: async () => ({ user: sessionUser(), face: sessionUser().faces[0] }),
  requireAdmin: async () => sessionUser(),
}));

/** Номер лица, чей кабинет открыт в проверках ниже. */
const FACE_PARAMS = Promise.resolve({ faceKind: 'club', faceId: '1' });

/** Отрисовать страницу кабинета лица: ей нужен номер лица из адреса. */
const withFace = () => ({ params: FACE_PARAMS });

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

  describe('личный кабинет человека', () => {
    it('спрашивает записи только вошедшего', async () => {
      signedInUserId = '1';
      const { default: ScheduleRoute } = await import('@/app/profile/me/schedule/page');

      await ScheduleRoute();

      expect(bookingCalls(stub)).toEqual(['/bookings?userId=1']);
    });

    it('у гостя записей не спрашивает вовсе', async () => {
      const { default: ScheduleRoute } = await import('@/app/profile/me/schedule/page');

      await ScheduleRoute();

      expect(bookingCalls(stub)).toEqual([]);
    });
  });

  describe('кабинет лица услуг', () => {
    it('спрашивает записи своих публикаций одним запросом и ни одной чужой', async () => {
      signedInUserId = '2';
      const { default: FaceStatsRoute } =
        await import('@/app/profile/[faceKind]/[faceId]/stats/page');

      await FaceStatsRoute(withFace());

      // ⚠️ Раньше здесь стоял веер: по запросу на каждую свою публикацию, и в каждом
      // `scope=all`. Публикации перечислял сам фронт, то есть их номера ехали
      // на бэкенд снаружи, а полный срез площадки после закрытия правом
      // администратора стал отвечать отказом — кабинет перестал открываться.
      // Теперь публикации находит бэкенд по владельцу сессии, и запрос ровно один.
      // Срез спрашивается ПО ЛИЦУ: у владельца трёх клубов кабинет каждого
      // показывает свои записи, а не общую кучу.
      expect(bookingCalls(stub)).toEqual(['/bookings?scope=owner&faceType=club&faceId=1']);
    });

    it('у гостя записей не спрашивает вовсе', async () => {
      const { default: FaceStatsRoute } =
        await import('@/app/profile/[faceKind]/[faceId]/stats/page');

      await FaceStatsRoute(withFace());

      expect(bookingCalls(stub)).toEqual([]);
    });

    it('макет спрашивает то же самое, что и страница, и ничего сверх', async () => {
      signedInUserId = '2';
      const { default: FaceCabinetLayout } =
        await import('@/app/profile/[faceKind]/[faceId]/layout');

      await FaceCabinetLayout({ children: null, params: FACE_PARAMS });

      // Макет решает по записям, показывать ли раздел «Записи», — и ему нужен
      // ровно тот же срез, что и странице. Отсюда общий загрузчик.
      expect(bookingCalls(stub)).toEqual(['/bookings?scope=owner&faceType=club&faceId=1']);
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
        'src/app/profile/[faceKind]/[faceId]/layout.tsx',
        'src/app/profile/[faceKind]/[faceId]/dashboard/page.tsx',
        'src/app/profile/[faceKind]/[faceId]/stats/page.tsx',
        'src/app/profile/[faceKind]/[faceId]/bookings/page.tsx',
        'src/app/profile/[faceKind]/[faceId]/clients/page.tsx',
      ];

      for (const file of files) {
        const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

        expect({ file, usesLoader: /loadFaceScope/.test(text) }).toEqual({
          file,
          usesLoader: true,
        });
        expect({ file, bypasses: /getBookings\w*\(/.test(text) }).toEqual({
          file,
          bypasses: false,
        });
      }
    });

    it('обзор берёт ЧИСЛО непрочитанных своего ящика, а не ленту', async () => {
      signedInUserId = '2';
      const { default: FaceDashboardRoute } =
        await import('@/app/profile/[faceKind]/[faceId]/dashboard/page');

      await FaceDashboardRoute(withFace());

      // ⚠️ Обзору нужно ОДНО число — сколько непрочитанных в ящике этого кабинета.
      // Путь у этого числа был длинный. Сначала ради него запрашивалась лента ВСЕЙ
      // площадки (`scope=all`) и фильтровалась в памяти; потом — лента человека,
      // и фильтр переехал в сводку. Осталась главная беда обоих способов: лента
      // приходит СТРАНИЦЕЙ, и счёт по ней занижался после сотого уведомления.
      //
      // Теперь спрашивается счётчик и называется ящик кабинета (шаг 37.57): ленту
      // обзор не просит вовсе, а число приходит от того, у кого есть все строки.
      const notificationCalls = stub.calls.filter((call) => call.startsWith('/notifications'));

      expect(notificationCalls).toEqual(['/notifications/unread-count?clubId=1']);
    });

    it('раздел уведомлений спрашивает ЯЩИК ЛИЦА, а не ленту человека', async () => {
      // ⚠️ Найдено проверкой чек-листов (35.47a) и стоило фазе повторения её же
      // главного урока. Адресат уведомления стал лицом в 35.27, бэкенд научился
      // отдавать ящик каждого лица в 35.28, всё покрыто тестами — а страница
      // кабинета продолжала спрашивать ленту ЧЕЛОВЕКА целиком. Снаружи разделения
      // не существовало: у владельца трёх клубов все три кабинета показывали кучу.
      //
      // Тесты этого не видели, потому что смотрели на API. Здесь проверяется
      // ПОДКЛЮЧЕНИЕ: какой адрес страница на самом деле дёргает.
      signedInUserId = '2';
      const { default: FaceNotificationsRoute } =
        await import('@/app/profile/[faceKind]/[faceId]/notifications/page');

      await FaceNotificationsRoute(withFace());

      const calls = stub.calls.filter((call) => call.startsWith('/notifications'));

      expect(calls, 'страница уведомлений лица не сходила за уведомлениями').not.toEqual([]);
      expect(
        calls.every((call) => call.includes('clubId=1')),
        `ящик лица не назван: ${calls.join(', ')}`,
      ).toBe(true);
    });

    it('личный раздел уведомлений спрашивает ЛИЧНЫЙ ящик', async () => {
      // Обратная половина: без указания ящика сюда попадали бы заявки на запись
      // в его же клуб — они адресованы клубу, а не человеку.
      signedInUserId = '2';
      const { default: PersonalNotificationsRoute } =
        await import('@/app/profile/me/notifications/page');

      await PersonalNotificationsRoute();

      const calls = stub.calls.filter((call) => call.startsWith('/notifications'));

      expect(calls, 'личный раздел уведомлений не сходил за уведомлениями').not.toEqual([]);
      expect(
        calls.every((call) => call.includes('scope=personal')),
        `личный ящик не назван: ${calls.join(', ')}`,
      ).toBe(true);
    });

    it('ни одна страница кабинета не просит полного среза площадки', async () => {
      // ⚠️ Сторож всего разбора: `?scope=all` закрыт правом администратора, и любая
      // его форма на странице провайдера — это 403 и упавшая страница, а не «просто
      // лишние данные». Проверяются все четыре страницы кабинета и макет.
      signedInUserId = '2';
      const routes = [
        '@/app/profile/[faceKind]/[faceId]/layout',
        '@/app/profile/[faceKind]/[faceId]/dashboard/page',
        '@/app/profile/[faceKind]/[faceId]/stats/page',
        '@/app/profile/[faceKind]/[faceId]/bookings/page',
        '@/app/profile/[faceKind]/[faceId]/clients/page',
      ];

      for (const route of routes) {
        vi.resetModules();
        stub.restore();
        stub = installApiStub(createFixtureRoutes());

        const { default: Route } = await import(route);

        await Route({ children: null, params: FACE_PARAMS });

        expect({ route, all: stub.calls.filter((call) => call.includes('scope=all')) }).toEqual({
          route,
          all: [],
        });
      }
    });

    /**
     * Фаза 38 (после 38.25). Второго запроса — истории клиентов по всей площадке
     * (`?scope=clients`) — у разделов больше нет: он читался ради бейджа надёжности
     * клиента, бейдж вырезан, а на бэкенде режим снят и отвечает 400. Раздел, который
     * его по-прежнему спросил бы, падал бы целиком — поэтому проверяется ПОДКЛЮЧЕНИЕ:
     * ровно один запрос записей, и он — записи публикаций лица.
     */
    it('раздел клиентов читает только записи публикаций лица — одним запросом', async () => {
      signedInUserId = '2';
      const { default: FaceClientsRoute } =
        await import('@/app/profile/[faceKind]/[faceId]/clients/page');

      await FaceClientsRoute(withFace());

      expect(bookingCalls(stub)).toEqual(['/bookings?scope=owner&faceType=club&faceId=1']);
    });

    it('раздел записей читает тот же единственный срез', async () => {
      signedInUserId = '2';
      const { default: FaceBookingsRoute } =
        await import('@/app/profile/[faceKind]/[faceId]/bookings/page');

      await FaceBookingsRoute(withFace());

      expect(bookingCalls(stub)).toEqual(['/bookings?scope=owner&faceType=club&faceId=1']);
    });

    it('у гостя записей не спрашивает вовсе', async () => {
      // Кто такой «этот провайдер», знает только сессия: без неё спрашивать нечего,
      // и запрос не должен уходить «на всякий случай».
      const { default: FaceClientsRoute } =
        await import('@/app/profile/[faceKind]/[faceId]/clients/page');

      await FaceClientsRoute(withFace());

      expect(bookingCalls(stub)).toEqual([]);
    });
  });
});
