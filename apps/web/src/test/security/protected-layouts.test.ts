// Серверная проверка доступа в лейаутах закрытых зон.
//
// ⚠️ Что утекало в бою до фазы 34. Проверка доступа жила в браузере (`AdminGuard`
// и такие же клиентские плашки в кабинетах): страница рисовалась ЦЕЛИКОМ, данные
// уезжали в поток ответа, и уже поверх них показывалось «нет доступа». То есть
// список всех пользователей платформы, записи и публикации у гостя уже были —
// их просто не рисовали. Увидеть это в браузере нельзя, видно только в исходнике
// ответа.
//
// Теперь уводит проверка в самом лейауте — ДО любого похода за данными.
// Диверсия d-25 фазы 34 (убрать `await requireRole(['athlete'])` из лейаута
// кабинета) не покраснела: во всём `src/test` на `@/lib/session` ссылается один
// файл, и тот его мокает целиком. Поэтому здесь сессия НЕ подменяется: работает
// настоящая проверка страницы, а подменены только два её источника — cookie
// и ответ бэкенда на «кто я».
//
// ⚠️ Фаза 35, шаг 35.4: «чужой» задан ВЛАДЕНИЕМ, а не ролью (ловушка 7.9).
// Прежняя редакция описывала чужого строкой `role: 'club_owner'`. Ролей нет
// с шага 35.24, и такой набор остался бы зелёным, перестав проверять хоть
// что-нибудь: «чужих» в нём просто не осталось бы. Здесь человек описан фактами
// модели фазы 35 — номер, лица услуг (клубы и карточки тренера), служебная запись.
//
// Проверяются два утверждения, и второе важнее первого:
//   1) кого пускать и кого уводить (`redirect('/')`);
//   2) уведённому данные не запрашиваются ВООБЩЕ. Тест, который смотрит только
//      на редирект, пропустил бы ровно ту дыру, из-за которой затевалась фаза 34:
//      увести-то уводило и раньше, но после того, как данные уже отдали.
//
// Четыре случая, ради которых набор затевался, закрыты в этапе Э3: личный
// кабинет пускает владельца клубов и владельца карточки, кабинет лица пускает
// владельца собственной карточки и не пускает человека без единого лица.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs, fixtureTrainers } from '@/test/helpers/fixture-routes';
import { fixtureTrainer } from '@sporthub/fixtures';
import type { EntityId, Trainer } from '@sporthub/types';

/** Лицо услуг: клуб или карточка тренера. Ими человек владеет, ролью — нет. */
type Face = { kind: 'club' | 'trainer'; id: EntityId };

/**
 * Человек, каким его знает площадка.
 *
 * ⚠️ Поля роли здесь нет с шага 35.24, и это существенно: пока оно было, набор
 * мог остаться зелёным, продолжая проверять именно его. Человек описан ровно
 * тем, что о нём правда: номер, лица услуг и признак служебной записи.
 */
type Visitor = {
  title: string;
  id: number;
  faces: Face[];
  /** Служебная запись — единственное различие, не выводимое из владения. */
  isAdmin: boolean;
};

/** Номер человека, у которого есть карточка тренера и больше ничего. */
const SOLO_CARD_OWNER_ID = 7;

/**
 * Карточка тренера, принадлежащая человеку, у которого больше ничего нет.
 *
 * В общих фикстурах все карточки принадлежат владельцу клубов, и случай
 * «единственное лицо — карточка» на них не выражается, а это ровно тот случай,
 * который до фазы 35 получал отказ на собственном кабинете (дефект 4.6 № 1).
 */
const SOLO_TRAINER_CARD: Trainer = {
  ...fixtureTrainer,
  id: 99,
  name: 'Ольга Лебедева',
  slug: 'olga-lebedeva',
  managedByUserId: SOLO_CARD_OWNER_ID,
};

/** Каталог стенда: общие фикстуры плюс одиночная карточка. */
const CATALOG_TRAINERS: Trainer[] = [...fixtureTrainers, SOLO_TRAINER_CARD];

/**
 * Лица человека — вычисляются из того же каталога, который отдаёт стенд.
 * Списком руками их не задать: тогда мир теста разошёлся бы сам с собой,
 * и «владелец» мог бы оказаться владельцем несуществующего клуба.
 */
function facesOf(userId: number): Face[] {
  return [
    ...fixtureClubs
      .filter((club) => club.managedByUserId === userId)
      .map((club) => ({ kind: 'club' as const, id: club.id })),
    ...CATALOG_TRAINERS.filter((trainer) => trainer.managedByUserId === userId).map((trainer) => ({
      kind: 'trainer' as const,
      id: trainer.id,
    })),
  ];
}

/** Собрать человека: лица подтягиваются из каталога по его номеру. */
function person(title: string, id: number, isAdmin: boolean = false): Visitor {
  return { title, id, faces: facesOf(id), isAdmin };
}

// Пятеро, и каждый закрывает свой случай модели фазы 35.
/** Просто тренируется: записи, отзывы, избранное. Лиц услуг нет. */
const PERSON = person('человек без лиц услуг', 1);
/** Владеет клубами и карточками — им кабинет лица и нужен. */
const CLUB_OWNER = person('владелец клубов и карточек', 2);
/** Владеет одной карточкой тренера и больше ничем. */
const CARD_OWNER = person('владелец одной карточки тренера', SOLO_CARD_OWNER_ID);
/** Лиц нет ни одного — в кабинет лица пускать некуда. */
const ROLE_WITHOUT_FACES = person('человек без единого лица', 4);
/** Служебная запись: базового набора человека не получает (решение 13). */
const ADMIN = person('администратор', 3, true);

/** Кто стучится в закрытую зону. `null` — гость: cookie нет вовсе. */
let visitor: Visitor | null = null;

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
 * ⚠️ Лица едут ОТВЕТОМ «кто я», а не читаются из каталога, и это требование,
 * а не удобство: проверка владения обязана уложиться в тот же единственный
 * запрос, иначе уведённый успеет получить каталог — и утверждение «данных
 * не запрашивали» станет невыполнимым. Имя поля закрепляет шаг 35.21; пока
 * ответ его не привозит, оно живёт только здесь и правится в одном месте.
 *
 * Неизвестный адрес стенд не проглатывает, а роняет тест с именем адреса —
 * значит любой незапланированный поход за данными будет виден.
 */
function installStub(): ApiStub {
  return installApiStub({
    ...createFixtureRoutes(),
    '/trainers': CATALOG_TRAINERS,
    '/trainers?includeHidden=true': CATALOG_TRAINERS,
    '/auth/me':
      visitor === null
        ? null
        : {
            id: visitor.id,
            name: visitor.title,
            email: `person-${visitor.id}@test.local`,
            faces: visitor.faces,
            accountKind: visitor.isAdmin ? 'admin' : 'person',
            capabilities: [],
          },
  });
}

/** Обращения за ДАННЫМИ — всё, кроме вопроса «кто я». */
const dataCalls = (stub: ApiStub): string[] =>
  stub.calls.filter((call) => !call.startsWith('/auth/me'));

/**
 * Закрытые зоны: свой лейаут, свои допущенные и свои чужие.
 *
 * ⚠️ После Э5 кабинет лица станет адресным (`/profile/club/[id]`,
 * `/profile/trainer/[id]`), и к «чужим» добавится случай, которого сегодня
 * не выразить: владелец ДРУГОГО лица. Правило тут же станет строже —
 * «владелец именно этого лица», — а форма набора не изменится.
 */
const GUARDED_AREAS = [
  {
    title: 'личный кабинет человека (/profile/athlete)',
    load: () => import('@/app/profile/athlete/layout'),
    // Раздел человека: записи, отзывы, избранное. Есть у любого вошедшего,
    // и наличие лиц услуг тут ни при чём — владелец клуба тоже ходит на йогу.
    allowed: [PERSON, CLUB_OWNER, CARD_OWNER, ROLE_WITHOUT_FACES],
    // Админ базового набора не получает (решение 13): ему сюда незачем.
    denied: [ADMIN],
  },
  {
    title: 'кабинет лица услуг (/profile/provider)',
    // Владелец клубов управляет клубами 1–3 и карточками 1, 3, 5 — на нём лейаут
    // действительно грузит срез кабинета, и «данных не запрашивали» становится
    // проверяемым утверждением, а не пустым.
    load: () => import('@/app/profile/provider/layout'),
    allowed: [CLUB_OWNER, CARD_OWNER],
    denied: [PERSON, ROLE_WITHOUT_FACES, ADMIN],
  },
  {
    title: 'сервисная панель',
    load: () => import('@/app/service-portal/(admin)/layout'),
    allowed: [ADMIN],
    denied: [PERSON, CLUB_OWNER, CARD_OWNER],
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

    it.each([...denied])(
      'уводит так же, как гостя, и тоже без единого запроса данных: $title',
      async (stranger) => {
        // Чужой — это человек, у которого нет ЭТОГО предмета: ни карточки,
        // ни клуба, ни служебной записи. Сессия у него есть, и утечь здесь
        // может ровно то же самое, что и гостю.
        visitor = stranger;
        stub = installStub();
        const { default: Layout } = await load();

        await expect(Layout({ children: null })).rejects.toThrow(/NEXT_REDIRECT/);

        expect(redirects).toEqual(['/']);
        expect(dataCalls(stub)).toEqual([]);
      },
    );

    it.each([...allowed])('пускает своего: $title', async (owner) => {
      // Контроль: без него проверки выше зеленели бы и на лейауте, который
      // не пускает вообще никого.
      visitor = owner;
      stub = installStub();
      const { default: Layout } = await load();

      await expect(Layout({ children: null })).resolves.toBeTruthy();
      expect(redirects).toEqual([]);
    });
  });

  it('лейаут кабинета лица грузит данные — значит «ни одного запроса» выше не пустое утверждение', async () => {
    // ⚠️ Это подпорка под главную проверку. Лейаут кабинета лица — единственный
    // из трёх, кто сам ходит за данными (`loadProviderScope`). Если он однажды
    // перестанет это делать, проверки «данных не запрашивали» станут
    // самоисполняющимися, и падать должно здесь, а не молча нигде.
    visitor = CLUB_OWNER;
    stub = installStub();
    const { default: ProviderProfileLayout } = await import('@/app/profile/provider/layout');

    await ProviderProfileLayout({ children: null });

    expect(dataCalls(stub).some((call) => call.startsWith('/clubs'))).toBe(true);
    expect(dataCalls(stub).some((call) => call.startsWith('/bookings'))).toBe(true);
  });

  it('проверка стоит ПЕРЕД загрузкой среза кабинета, а не после неё', async () => {
    // Порядок — вся суть фазы 34. Та же проверка, поставленная строкой ниже
    // `loadProviderScope`, дала бы точно такой же редирект в браузере, но записи
    // и публикации кабинета к этому моменту уже были бы прочитаны и отданы.
    visitor = PERSON;
    stub = installStub();
    const { default: ProviderProfileLayout } = await import('@/app/profile/provider/layout');

    await expect(ProviderProfileLayout({ children: null })).rejects.toThrow(/NEXT_REDIRECT/);

    expect(stub.calls).toEqual(['/auth/me']);
  });
});
