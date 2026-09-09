// Общая обвязка контроллер-тестов.
//
// Каждый набор поднимает приложение целиком на своей временной директории данных:
// так тест проверяет тот же путь, что и рабочий сервер, а не подменённые слои.
// Пустые файлы создаются для всех коллекций сразу — иначе первый же запрос,
// который читает соседнюю коллекцию, падает на отсутствующем файле.

import type { INestApplication, InjectionToken } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../app.module';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { SessionService } from '../auth/session.service';
import { configureApp } from '../configure-app';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

import { exportSourceShape } from '../storage/seed/export-source-shape';
import { importSourceData } from '../storage/seed/import-from-files';
import type { SourceData } from '../storage/seed/source-data';
import { createTestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

// Phase 33 Step 33.9: пароля открытым текстом в хранилище больше нет — тесты
// кладут в пользователей готовый argon2id-хеш. Пара «пароль + его хеш»
// объявлена здесь один раз: копия в каждом наборе разъехалась бы при первой же
// смене параметров хеширования.
/** Пароль тестовых пользователей — в открытом виде нужен только запросам. */
export const DEMO_PASSWORD = 'demo123';

/** Его argon2id-хеш теми же параметрами, что и в рабочем коде. */
export const DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$S3YSJKRRJ61/o2IZha4RnQ$gKfspZaaqYNv4W41Lx/WoX8Q/fPn1WZKjQLIGbz3YDQ';

/** Все коллекции проекта. Отсутствие файла — ошибка чтения, поэтому создаются все. */
export const COLLECTIONS = [
  'clubs',
  'trainers',
  'offerings',
  'schedule',
  'bookings',
  'reviews',
  'users',
  'notifications',
  'logs',
  'trainer-club-links',
  'provider-client-notes',
  'sports',
  'cities',
  'tags',
  'amenities',
  'specialties',
  'work-formats',
] as const;

/** Имя коллекции. */
export type CollectionName = (typeof COLLECTIONS)[number];

/**
 * Подмена одного провайдера в поднимаемом приложении.
 *
 * Нужна там, где реализация уходит НАРУЖУ процесса и в тесте этого быть не должно:
 * сегодня это отправитель писем (`MAILER`). Подмена идёт через тот же токен
 * внедрения, что и в бою, — и потому проверяет заодно главное обещание границы:
 * если реализацию нельзя заменить снаружи, значит её смена потребует правки
 * бизнес-кода, и весь смысл токена теряется.
 */
export type ProviderOverride = {
  token: InjectionToken;
  useValue: unknown;
};

export type TestHarness = {
  app: INestApplication;
  /** Перезаписать коллекцию целиком — тем же форматом, что пишет хранилище. */
  write(name: string, data: unknown): Promise<void>;
  /**
   * Перезаписать сразу несколько коллекций.
   *
   * Нужно не для краткости: на базе каждая запись переносит срез целиком, потому что
   * таблицу нельзя записать в отрыве от тех, на которые она ссылается. Набор,
   * разложенный на десяток вызовов `write`, дал бы десяток переносов — и каждый
   * промежуточный обязан был бы быть целостным, чего у половины наборов нет.
   */
  writeMany(collections: Partial<Record<CollectionName, unknown>>): Promise<void>;
  /** Прочитать коллекцию с диска: проверка состояния после запроса. */
  read<T = unknown>(name: string): Promise<T>;
  /**
   * Действовать от лица пользователя: выдаёт ему сессию и возвращает готовую
   * строку cookie для `.set('Cookie', await harness.as(1))`.
   *
   * Имя `as`, а не `cookieFor`, выбрано по месту вызова: тест говорит, ОТ ЧЬЕГО
   * ЛИЦА идёт запрос, а не каким заголовком это переносится. Способ переноса
   * личности — дело обвязки, и если он однажды сменится (заголовок вместо cookie),
   * менять придётся одну функцию, а не сотни вызовов в наборах.
   *
   * ⚠️ Звать ТОЛЬКО после `write`/`writeMany`: каждая запись пересобирает базу
   * целиком (`TRUNCATE ... CASCADE`), а сессии — обычная таблица той же схемы.
   * Cookie, выданная до засева, умрёт вместе с ним, и тест получит 401 без
   * единого намёка на причину.
   */
  as(userId: number): Promise<string>;
  close(): Promise<void>;
};

/** Имя коллекции → поле среза данных. Отличаются только те, где дефис или два слова. */
const SOURCE_FIELD: Record<(typeof COLLECTIONS)[number], keyof SourceData> = {
  clubs: 'clubs',
  trainers: 'trainers',
  offerings: 'offerings',
  schedule: 'schedule',
  bookings: 'bookings',
  reviews: 'reviews',
  users: 'users',
  notifications: 'notifications',
  logs: 'logs',
  'trainer-club-links': 'trainerClubLinks',
  'provider-client-notes': 'providerClientNotes',
  sports: 'sports',
  cities: 'cities',
  tags: 'tags',
  amenities: 'amenities',
  specialties: 'specialties',
  'work-formats': 'workFormats',
};

/** Пустой срез: с него начинается каждый набор. */
function emptySource(): SourceData {
  return Object.fromEntries(
    Object.values(SOURCE_FIELD).map((field) => [field, []]),
  ) as unknown as SourceData;
}

/**
 * Обвязка на БАЗЕ: тот же набор проверок, другое хранилище.
 *
 * Две вещи здесь сделаны иначе, чем у файлов, и обе — вынужденно:
 *
 * 1. **Одну таблицу в отрыве от других не записать.** У базы есть внешние ключи, и
 *    запись на несуществующий слот она не примет. Поэтому правка идёт срезом целиком:
 *    таблицы чистятся и переносятся заново одним переносом.
 * 2. **Правка обязана менять ТОЛЬКО названные коллекции.** Файловая обвязка пишет один
 *    файл и остальных не касается, и наборы на это опираются: половина из них создаёт
 *    сущность запросом, а потом дописывает соседнюю коллекцию. Поэтому текущее состояние
 *    базы выгружается целиком, и правка накладывается НА НЕГО — иначе всё, что успело
 *    создать приложение, исчезало бы при первой же дозаписи.
 */
async function createDatabaseHarness(overrides: ProviderOverride[]): Promise<TestHarness> {
  const db = await createTestDatabase();

  // Стартовый срез пуст: наборы засеивают себя сами. Чистка обязательна: схема
  // переживает прогон, и без неё набор начинался бы на остатках предыдущего —
  // причём молча, потому что остатки выглядят как обычные данные.
  await db.truncateAll();
  await importSourceData({ client: db.prisma, source: emptySource(), recalculate: false });

  const applyWrite = async (patch: Partial<Record<CollectionName, unknown>>): Promise<void> => {
    const current = await exportSourceShape(db.prisma);

    for (const [name, data] of Object.entries(patch)) {
      current[SOURCE_FIELD[name as CollectionName]] = data as never;
    }

    await db.truncateAll();
    // ⚠️ Пересчёт счётчиков выключен намеренно: обвязка обязана положить в базу ровно
    // тот срез, который объявил набор. Иначе «слот занят целиком» превратился бы
    // в «свободен», и одна и та же проверка на файлах и на базе проверяла бы разное.
    await importSourceData({ client: db.prisma, source: current, recalculate: false });
  };

  // Подмены накладываются на тот же модуль, что и в бою: собирается приложение
  // целиком, и заменяется ровно один провайдер по своему токену.
  const builder = overrides.reduce(
    (accumulator, override) =>
      accumulator.overrideProvider(override.token).useValue(override.useValue),
    Test.createTestingModule({ imports: [AppModule] }),
  );
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    // Каталога данных у этой обвязки нет: путь оставлен пустым намеренно, чтобы
    // обращение к нему было видно сразу, а не молча читало чужие файлы.
    write(name, data) {
      return applyWrite({ [name as CollectionName]: data });
    },
    writeMany(collections) {
      return applyWrite(collections);
    },
    async read<T>(name: string): Promise<T> {
      const exported = await exportSourceShape(db.prisma);

      return exported[SOURCE_FIELD[name as CollectionName]] as T;
    },
    async as(userId: number): Promise<string> {
      // Пользователь берётся ИЗ БАЗЫ, а не сочиняется здесь: сессия зависит от роли
      // (у ролей разные сроки), и придуманная роль расходилась бы с той, по которой
      // маршрут потом проверяет права. Тест засеял пользователя — от него и пляшем.
      const users = app.get<UsersRepository>(USERS_REPOSITORY);
      const user = await users.findById(userId);

      if (user === null) {
        // Без этой ошибки промах превращается в 401 на ровном месте: тест краснеет
        // на «требуется вход», хотя вход тут ни при чём — просто пользователя забыли
        // засеять (или засеяли, а следующий `write` пересобрал базу).
        throw new Error(
          `Обвязка не может войти за пользователя ${userId}: его нет в базе. ` +
            'Засей его через write/writeMany ДО вызова as() — каждая запись ' +
            'пересобирает базу и гасит выданные сессии.',
        );
      }

      // Сессия выдаётся тем же сервисом, что и на настоящем входе. Собрать строку
      // руками было бы короче, но тогда обвязка знала бы устройство идентификатора
      // сама — и разошлась бы с выдачей при первой же её правке, причём молча:
      // наборы продолжили бы зеленеть, проверяя вход, которого больше нет.
      const { token } = await app.get(SessionService).issue({ user, now: new Date() });

      // Значение кодируется так же, как его ставит express: разбор на стороне
      // сервера симметрично раскодирует, и любой будущий небезопасный символ
      // в идентификаторе переживёт дорогу.
      return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
    },
    async close() {
      await app.close();
      await db.close();
    },
  };
}

/**
 * Поднять приложение на своей схеме базы.
 *
 * Хранилище одно — база. Файловая реализация удалена в фазе 34 (этап Э0a): пока она
 * была жива как путь отката, тот же набор гонялся на обеих реализациях, и совпадение
 * результатов доказывало, что переезд ничего не изменил. Доказательство своё дело
 * сделало, а вторая реализация каждой новой таблицы стоила бы работы впустую.
 *
 * Имя `prefix` остаётся в сигнатуре: по нему различаются схемы параллельных прогонов.
 *
 * `overrides` не задаётся почти нигде и по умолчанию пуст: набор обязан проверять
 * то же приложение, что работает в бою. Подмена оправдана только для того, что
 * уходит за пределы процесса, — см. `ProviderOverride`.
 */
export async function createTestHarness(
  _prefix: string,
  overrides: ProviderOverride[] = [],
): Promise<TestHarness> {
  await ensureTestSchema();

  return createDatabaseHarness(overrides);
}
