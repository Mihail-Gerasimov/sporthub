// Серверная проверка доступа в лейаутах закрытых зон.
//
// ⚠️ Что утекало в бою до фазы 34. Проверка доступа жила в браузере (`AdminGuard`
// и такие же клиентские плашки в кабинетах): страница рисовалась ЦЕЛИКОМ, данные
// уезжали в поток ответа, и уже поверх них показывалось «нет доступа». То есть
// список всех пользователей платформы, записи и публикации у гостя уже были —
// их просто не рисовали. Увидеть это в браузере нельзя, видно только в исходнике
// ответа.
//
// Теперь уводит `requireRole` в самом лейауте — ДО любого похода за данными.
// Диверсия d-25 фазы 34 (убрать `await requireRole(['athlete'])` из лейаута
// кабинета) не покраснела: во всём `src/test` на `@/lib/session` ссылается один
// файл, и тот его мокает целиком. Поэтому здесь сессия НЕ подменяется: работает
// настоящий `requireRole`, а подменены только его источники — cookie и ответ
// бэкенда на «кто я».
//
// Проверяются два утверждения, и второе важнее первого:
//   1) гостя и чужую роль уводит (`redirect('/')`);
//   2) данные при этом не запрашиваются ВООБЩЕ. Тест, который смотрит только
//      на редирект, пропустил бы ровно ту дыру, из-за которой затевалась фаза:
//      увести-то уводило и раньше, но после того, как данные уже отдали.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import type { UserRole } from '@sporthub/types';

/** Кто стучится в закрытую зону. `null` — гость: cookie нет вовсе. */
let visitor: { id: number; role: UserRole } | null = null;

/** Адреса, на которые увела серверная проверка. */
const redirects: string[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    toString: () => (visitor === null ? '' : `sh-session=session-${visitor.id}`),
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (url: string) => {
    redirects.push(url);

    // ⚠️ Бросок обязателен, а не «для красоты»: настоящий `redirect` прерывает
    // отрисовку именно так. Без него лейаут после проверки спокойно пошёл бы
    // дальше и честно сходил за данными — и утверждение «данных не запрашивали»
    // перестало бы что-либо значить.
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

/**
 * Стенд ответов бэкенда: справочники и коллекции из общих фикстур плюс «кто я».
 *
 * Неизвестный адрес стенд не проглатывает, а роняет тест с именем адреса —
 * значит любой незапланированный поход за данными будет виден.
 */
function installStub(): ApiStub {
  return installApiStub({
    ...createFixtureRoutes(),
    '/auth/me':
      visitor === null
        ? null
        : {
            id: visitor.id,
            name: 'Тест',
            email: 't@test.local',
            role: visitor.role,
            capabilities: [],
          },
  });
}

/** Обращения за ДАННЫМИ — всё, кроме вопроса «кто я». */
const dataCalls = (stub: ApiStub): string[] =>
  stub.calls.filter((call) => !call.startsWith('/auth/me'));

/** Закрытые зоны: свой лейаут, своя допущенная роль и своя чужая. */
const GUARDED_AREAS = [
  {
    title: 'кабинет атлета',
    load: () => import('@/app/profile/athlete/layout'),
    allowed: { id: 1, role: 'athlete' as UserRole },
    denied: { id: 2, role: 'club_owner' as UserRole },
  },
  {
    title: 'кабинет провайдера',
    // Провайдер 2 управляет клубами 1 и 2 и тренерами 1, 3, 5 — на нём лейаут
    // действительно грузит срез кабинета, и «данных не запрашивали» становится
    // проверяемым утверждением, а не пустым.
    load: () => import('@/app/profile/provider/layout'),
    allowed: { id: 2, role: 'club_owner' as UserRole },
    denied: { id: 1, role: 'athlete' as UserRole },
  },
  {
    title: 'сервисная панель',
    load: () => import('@/app/service-portal/(admin)/layout'),
    allowed: { id: 3, role: 'admin' as UserRole },
    denied: { id: 1, role: 'athlete' as UserRole },
  },
] as const;

describe('Закрытые зоны: проверка доступа на сервере', () => {
  let stub: ApiStub;

  beforeEach(() => {
    vi.resetModules();
    redirects.length = 0;
  });

  afterEach(() => {
    stub.restore();
    visitor = null;
  });

  describe.each(GUARDED_AREAS)('$title', ({ load, allowed, denied }) => {
    it('гостя уводит на главную и данных не запрашивает вовсе', async () => {
      visitor = null;
      stub = installStub();
      const { default: Layout } = await load();

      await expect(Layout({ children: null })).rejects.toThrow(/NEXT_REDIRECT/);

      expect(redirects).toEqual(['/']);
      expect(dataCalls(stub)).toEqual([]);
    });

    it('чужую роль уводит так же, как гостя, и тоже без единого запроса данных', async () => {
      // Роль решается тем же ответом «кто я», но по другой ветке: сессия есть,
      // а кабинет не её. Утечь здесь может ровно то же самое.
      visitor = denied;
      stub = installStub();
      const { default: Layout } = await load();

      await expect(Layout({ children: null })).rejects.toThrow(/NEXT_REDIRECT/);

      expect(redirects).toEqual(['/']);
      expect(dataCalls(stub)).toEqual([]);
    });

    it('свою роль пускает', async () => {
      // Контроль: без него две проверки выше зеленели бы и на лейауте, который
      // не пускает вообще никого.
      visitor = allowed;
      stub = installStub();
      const { default: Layout } = await load();

      await expect(Layout({ children: null })).resolves.toBeTruthy();
      expect(redirects).toEqual([]);
    });
  });

  it('лейаут провайдера грузит данные кабинета — значит «ни одного запроса» выше не пустое утверждение', async () => {
    // ⚠️ Это подпорка под главную проверку. Лейаут провайдера — единственный из
    // трёх, кто сам ходит за данными (`loadProviderScope`). Если он однажды
    // перестанет это делать, проверки «данных не запрашивали» станут
    // самоисполняющимися, и падать должно здесь, а не молча нигде.
    visitor = { id: 2, role: 'club_owner' };
    stub = installStub();
    const { default: ProviderProfileLayout } = await import('@/app/profile/provider/layout');

    await ProviderProfileLayout({ children: null });

    expect(dataCalls(stub).some((call) => call.startsWith('/clubs'))).toBe(true);
    expect(dataCalls(stub).some((call) => call.startsWith('/bookings'))).toBe(true);
  });

  it('проверка стоит ПЕРЕД загрузкой среза кабинета, а не после неё', async () => {
    // Порядок — вся суть фазы 34. Тот же `requireRole`, поставленный строкой ниже
    // `loadProviderScope`, дал бы точно такой же редирект в браузере, но записи
    // и публикации кабинета к этому моменту уже были бы прочитаны и отданы.
    visitor = { id: 1, role: 'athlete' };
    stub = installStub();
    const { default: ProviderProfileLayout } = await import('@/app/profile/provider/layout');

    await expect(ProviderProfileLayout({ children: null })).rejects.toThrow(/NEXT_REDIRECT/);

    expect(stub.calls).toEqual(['/auth/me']);
  });
});
