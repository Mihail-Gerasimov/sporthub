// Серверный клиент бэкенда.
//
// Страницы раньше читали данные из файлов напрямую через `lib/db`. Теперь
// единственный источник — HTTP-бэкенд, и этот модуль повторяет прежние имена
// и сигнатуры функций: страницы отличаются от прежних только строкой импорта,
// а вся правка сосредоточена в одном месте.
//
// Модуль серверный: он ходит на бэкенд по внутреннему адресу, минуя
// проксирование, и в браузер не попадает.

import 'server-only';

import { cookies } from 'next/headers';

import type { NotificationGroupKey } from '@sporthub/domain';

import { mailboxParams, type NotificationsMailbox } from '@/lib/notification-mailbox';
import type { ServiceFaceRef } from '@/lib/service-faces';
import type {
  Amenity,
  Booking,
  BookingStatus,
  Club,
  EntityId,
  ISODateString,
  Notification,
  Offering,
  ProviderClientNote,
  PublicationSort,
  Review,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
  TrainerClubLink,
  User,
  WorkFormat,
} from '@sporthub/types';

/** Внутренний адрес бэкенда: тот же, что в проксировании Next. */
const API_ORIGIN = process.env.SPORT_HUB_API_ORIGIN ?? 'http://localhost:3001';

/** Общая форма ответа проекта. */
type ApiEnvelope<T> = { success: boolean; data?: T; error?: string };

/**
 * Сессия вызывающего для запроса со страницы.
 *
 * ⚠️ Браузерные запросы несут cookie сами — они идут через проксирование Next
 * и остаются в том же источнике. Запросы страниц идут ОТСЮДА, напрямую на адрес
 * бэкенда, и заголовков не несут вовсе. Без этого проброса получилось бы
 * «в браузере работает, а страница пустая»: бэкенд отвечал бы 401 на всё,
 * что требует входа.
 *
 * Ошибка чтения не считается сбоем: страницу могут отрисовывать вне запроса
 * (сборка, прогрев) — тогда сессии просто нет, и это нормальный гость.
 */
async function sessionHeaders(): Promise<Record<string, string>> {
  try {
    const jar = await cookies();
    const header = jar.toString();

    return header === '' ? {} : { cookie: header };
  } catch {
    return {};
  }
}

/** Разбор ошибки доступа: страница обязана отличать «нельзя» от «сломалось». */
export class SessionRequiredError extends Error {
  constructor(readonly path: string) {
    super(`Требуется вход для запроса ${path}`);
    this.name = 'SessionRequiredError';
  }
}

/**
 * Бэкенд не ответил.
 *
 * Отдельный тип нужен, чтобы страница могла отличить «данных нет» от «спросить
 * не удалось». Раньше эта разница пропадала: любой сбой превращался в пустой
 * массив, и каталог без базы выглядел ровно так же, как каталог, в котором
 * действительно ничего нет. Пользователь видел «на сайте пусто» вместо «сервис
 * временно недоступен», а разработчик — код ответа 200 на сломанной странице.
 */
export class BackendUnavailableError extends Error {
  constructor(
    readonly path: string,
    readonly status?: number,
  ) {
    super(
      status === undefined
        ? `Бэкенд не ответил на запрос ${path}`
        : `Бэкенд ответил кодом ${status} на запрос ${path}`,
    );
    this.name = 'BackendUnavailableError';
  }
}

/**
 * Запрос к бэкенду. Кэширование выключено: страницы показывают состояние
 * записей и расписания, а они меняются на каждом шаге сценария.
 *
 * Сбой не глушится: он поднимается наверх и доходит до границы ошибки Next,
 * которая показывает честное сообщение вместо пустой страницы.
 */
/**
 * Общее число строк из конверта постраничной выдачи.
 *
 * ⚠️ Заводится отдельно, потому что `apiGet` возвращает `data` и всё, что лежит
 * РЯДОМ с ним в конверте, теряет. Постраничные маршруты кладут `total` вторым
 * полем конверта — `{ success, data: [...], total, offset, limit }`, — и попытка
 * прочитать его из `data` даёт `undefined`, то есть ВЕЧНЫЙ НОЛЬ.
 *
 * Найдено браузерным прогоном: счётчик в панели показывал ноль при непустой
 * очереди, и по коду это выглядело правильным. Тест на компонент такое не ловит —
 * он проверяет отрисовку числа, а не то, откуда оно взялось.
 */
async function apiGetTotal(path: string): Promise<number> {
  const response = await fetch(`${API_ORIGIN}/api${path}`, {
    cache: 'no-store',
    headers: await sessionHeaders(),
  });

  if (!response.ok) {
    throw new BackendUnavailableError(path, response.status);
  }

  const body = (await response.json()) as { success?: boolean; total?: number };

  return body.success === true ? Number(body.total ?? 0) : 0;
}

async function apiGet<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_ORIGIN}/api${path}`, {
      cache: 'no-store',
      headers: await sessionHeaders(),
    });
  } catch {
    // Соединения нет вовсе: бэкенд не поднят, база недоступна, сеть отвалилась.
    throw new BackendUnavailableError(path);
  }

  // Отказ по доступу — не поломка сервиса. Страница на него отвечает уводом
  // на главную, а не сообщением «сервис недоступен».
  if (response.status === 401 || response.status === 403) {
    throw new SessionRequiredError(path);
  }

  if (!response.ok) {
    throw new BackendUnavailableError(path, response.status);
  }

  const body = (await response.json()) as ApiEnvelope<T>;

  if (!body.success || body.data === undefined) {
    throw new BackendUnavailableError(path, response.status);
  }

  return body.data;
}

/**
 * Запрос, для которого «не найдено» — обычный ответ, а не сбой.
 *
 * Так отличается несуществующий клуб (страница показывает «не найдено») от
 * недоступного бэкенда (страница показывает ошибку). Раньше оба случая давали
 * пустоту, и первый было не отличить от второго.
 */
async function apiGetOptional<T>(path: string): Promise<T | null> {
  let response: Response;

  try {
    response = await fetch(`${API_ORIGIN}/api${path}`, {
      cache: 'no-store',
      headers: await sessionHeaders(),
    });
  } catch {
    throw new BackendUnavailableError(path);
  }

  if (response.status === 404) return null;

  if (response.status === 401 || response.status === 403) {
    throw new SessionRequiredError(path);
  }

  if (!response.ok) {
    throw new BackendUnavailableError(path, response.status);
  }

  const body = (await response.json()) as ApiEnvelope<T>;

  if (!body.success || body.data === undefined) return null;

  return body.data;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;

    search.set(key, String(value));
  }

  const text = search.toString();

  return text === '' ? '' : `?${text}`;
}

/**
 * Лицо услуг в строке запроса. Пара «вид + номер» либо ничего.
 *
 * ⚠️ Оба поля или ни одного — это требование маршрута, а не вежливость: половина
 * пары для него опечатка клиента, а не «отбора нет». Собрано в одном месте,
 * потому что лицом сужается не одна выдача.
 */
function faceQuery(face: ServiceFaceRef | undefined): Record<string, string | number> {
  return face === undefined ? {} : { faceType: face.kind, faceId: face.id };
}

/**
 * Лицо услуг как ВЛАДЕЛЕЦ предмета: `clubId` либо `trainerId`.
 *
 * ⚠️ Это другой отбор, чем `faceQuery`. Тот сужает срез кабинета целиком и
 * проходит проверку владения; этот отбирает предметы конкретного клуба или
 * конкретной карточки — им пользуются публичные выдачи отзывов и связей,
 * где владение ни при чём.
 *
 * Словарь, а не `if`: третий вид лица добавляется сюда строкой.
 */
const FACE_OWNER_PARAM: Record<ServiceFaceRef['kind'], 'clubId' | 'trainerId'> = {
  club: 'clubId',
  trainer: 'trainerId',
};

export function faceOwnerQuery(face: ServiceFaceRef | undefined): {
  clubId?: EntityId;
  trainerId?: EntityId;
} {
  return face === undefined ? {} : { [FACE_OWNER_PARAM[face.kind]]: face.id };
}

// --- Справочники ---------------------------------------------------------------

/**
 * Сколько публикаций ждёт повторной проверки (шаг 36.21).
 *
 * Спрашивается ровно счётчик: `limit=1` и число из ответа. Тянуть все публикации
 * ради одного числа значило бы платить за признак ценой, растущей вместе с каталогом.
 * Отбор — параметром запроса, под ним частичный индекс.
 *
 * Маршрут закрыт правом модерации, поэтому читатель у этой функции один — лейаут
 * служебной панели, где проверка уже пройдена.
 */
export async function getAwaitingRecheckCount(): Promise<number> {
  return apiGetTotal('/publications?awaitingRecheck=true&limit=1');
}

export const getSports = (): Promise<Sport[]> => apiGet<Sport[]>('/sports');
export const getTags = (): Promise<Tag[]> => apiGet<Tag[]>('/tags');
export const getAmenities = (): Promise<Amenity[]> => apiGet<Amenity[]>('/amenities');
export const getSpecialties = (): Promise<Specialty[]> => apiGet<Specialty[]>('/specialties');
export const getWorkFormats = (): Promise<WorkFormat[]> => apiGet<WorkFormat[]>('/work-formats');

// --- Публикации ----------------------------------------------------------------

/** Полный список, включая скрытые: личным кабинетам нужны и они. */
export const getClubs = (): Promise<Club[]> =>
  apiGet<Club[]>(`/clubs${query({ includeHidden: true })}`);

/**
 * Как спрашивать витринную выдачу (фаза 38, шаг 38.32).
 *
 * Оба поля необязательные, и без них вызов означает ровно то, что означал:
 * полный список в прежнем порядке. Витрина главной называет `sort: 'rating'`
 * и число — шесть клубов, четыре тренера, лидер с единицей, — и получает
 * из базы ровно столько, отсортированных запросом. Считать «лучших» в памяти
 * поверх всего каталога больше незачем.
 *
 * ⚠️ `limit` — число, а не строка: `undefined` в адрес не уезжает вовсе
 * (см. `query`), иначе бэкенд ответил бы 400 на `limit=undefined`.
 */
export type CatalogListOptions = {
  sort?: PublicationSort;
  limit?: number;
};

export const getPublishedClubs = (options: CatalogListOptions = {}): Promise<Club[]> =>
  apiGet<Club[]>(`/clubs${query(options)}`);

export const getTrainers = (): Promise<Trainer[]> =>
  apiGet<Trainer[]>(`/trainers${query({ includeHidden: true })}`);

export const getPublishedTrainers = (options: CatalogListOptions = {}): Promise<Trainer[]> =>
  apiGet<Trainer[]>(`/trainers${query(options)}`);

/**
 * Клуб по номеру для ПУБЛИЧНОЙ поверхности — карточки тренера, где он значится
 * площадкой занятий.
 *
 * Шаг 36.18. Раньше здесь поднимался ВЕСЬ каталог со скрытыми (`getClubs()`), и
 * нужная строка искалась в памяти: и лишний трафик, и скрытая публикация на чужой
 * публичной странице. Теперь это одна строка запросом — отбор делает маршрут.
 *
 * ⚠️ Скрытая площадка отсекается ЗДЕСЬ, а не только на бэкенде, и это не вторая
 * проверка того же правила. Маршрут решает «кому видна скрытая публикация» и отдаёт
 * тело владельцу и модератору; вопрос витрины другой — «что на ней место», и ответ
 * на него один для всех: только опубликованное.
 */
export async function getPublishedClubById(id: EntityId): Promise<Club | null> {
  const detail = await apiGetOptional<{ club: Club }>(`/clubs/${encodeURIComponent(String(id))}`);
  const club = detail?.club ?? null;

  return club === null || club.status === 'hidden' ? null : club;
}

/** Детальная карточка по адресу-ссылке. Возвращает только саму публикацию. */
export async function getClubBySlug(slug: string): Promise<Club | null> {
  const detail = await apiGetOptional<{ club: Club }>(`/clubs/by-slug/${encodeURIComponent(slug)}`);

  return detail?.club ?? null;
}

export async function getTrainerBySlug(slug: string): Promise<Trainer | null> {
  const detail = await apiGetOptional<{ trainer: Trainer }>(
    `/trainers/by-slug/${encodeURIComponent(slug)}`,
  );

  return detail?.trainer ?? null;
}

// --- Услуги и расписание --------------------------------------------------------

export const getOfferings = (): Promise<Offering[]> => apiGet<Offering[]>('/offerings');

export type GetScheduleOptions = { ownerType?: 'club' | 'trainer' | 'all' };

/**
 * Расписание. Страницы показывают и заполненные слоты — иначе занятое занятие
 * пропало бы из личного кабинета вместе с записью на него.
 */
export const getSchedule = (options: GetScheduleOptions = {}): Promise<Schedule[]> =>
  apiGet<Schedule[]>(
    `/schedule${query({ ownerType: options.ownerType ?? 'club', includeFull: true })}`,
  );

export const getScheduleSlotContext = (
  scheduleId: EntityId,
): Promise<{
  affiliatedClub: Club | null;
  club: Club | null;
  offering: Offering | null;
  schedule: Schedule;
  trainer: Trainer | null;
} | null> => apiGetOptional(`/schedule/${scheduleId}/context`);

// --- Записи ---------------------------------------------------------------------
//
// ⚠️ Раньше КАЖДАЯ из четырнадцати страниц забирала полный срез записей платформы
// и отбирала нужное уже в разметке. Стоимость такой страницы росла вместе с числом
// записей всей площадки, а не своих: кабинет одного атлета с тремя занятиями тянул
// столько же, сколько админская сводка.
//
// Теперь у каждой страницы свой запрос. Отбор задаёт `GetBookingsOptions`, и любое
// его поле необязательно: вызов без полей означает ровно то же, чем был `getBookings()`.

/**
 * Отбор записей. Повторяет необязательные параметры маршрута `GET /api/bookings`.
 *
 * Про клуб и тренера: бэкенд считает записью клуба и ту, где клуб — владелец,
 * и ту, где он площадка (тренер ведёт занятие в его зале); с тренером симметрично —
 * владелец либо ведущий. Это те же правила, по которым разбирают запись
 * `getBookingClubId` / `getBookingTrainerId`, поэтому выдача не уже того, что
 * страница потом отберёт сама.
 */
export type GetBookingsOptions = {
  userId?: EntityId;
  clubId?: EntityId;
  trainerId?: EntityId;
  /**
   * Лицо услуг, которым сужается срез кабинета (маршрут принимает пару с шага 35.27a).
   *
   * ⚠️ Это НЕ то же, что `clubId` / `trainerId`. Те отбирают записи, где клуб или
   * тренер участвует хоть как-нибудь — в том числе чужой; лицо сужает сам срез
   * кабинета и проходит проверку владения на бэкенде.
   */
  face?: ServiceFaceRef;
  scheduleId?: EntityId;
  /** Набор статусов; на проводе — перечисление через запятую. */
  status?: readonly BookingStatus[];
  /** Границы дня занятия включительно, строки `YYYY-MM-DD`. */
  dateFrom?: ISODateString;
  dateTo?: ISODateString;
  offset?: number;
  limit?: number;
};

/**
 * Полный срез записей платформы.
 *
 * Оставлен рабочим намеренно: на него смотрит эталон контрактов, и он честно нужен
 * там, где страница считает по всей площадке (админская сводка). Во всех остальных
 * местах страницы просят свой отбор — по человеку, лицу или слоту.
 *
 * Автопереходы по времени бэкенд прогоняет сам при чтении, отдельного вызова нет.
 */
export const getBookings = (): Promise<Booking[]> =>
  apiGet<Booking[]>(`/bookings${query({ scope: 'all' })}`);

export const getBookingsByUser = (userId: EntityId): Promise<Booking[]> =>
  apiGet<Booking[]>(`/bookings${query({ userId })}`);

/**
 * Записи ПУБЛИКАЦИЙ текущего провайдера — своих клубов и своих тренеров.
 *
 * ⚠️ Раньше на этом месте стоял веер: по запросу на каждую публикацию, и в каждом —
 * `?scope=all`, потому что без указания атлета маршрут иначе не отвечал. Публикации
 * при этом перечислял сам фронт, то есть номера ехали на бэкенд снаружи. С закрытием
 * полного среза правом администратора весь веер стал отвечать отказом, и кабинет
 * провайдера перестал открываться целиком.
 *
 * Теперь публикации находит бэкенд по владельцу сессии, а все они укладываются
 * в ОДНО условие запроса — отсюда один поход вместо N и невозможность спросить
 * чужой клуб: назвать его снаружи нечем.
 *
 * Склейка по номеру больше не нужна: одна запись у клуба-владельца и клуба-площадки
 * приезжала дважды именно потому, что запросов было два.
 *
 * ⚠️ Фаза 38 (после 38.25). Соседний вызов `getClientBookings` (`?scope=clients`,
 * история клиентов по всей площадке) снят вместе с бейджем надёжности — единственным
 * его читателем; режим снят и на бэкенде.
 */
export const getOwnPublicationBookings = (
  options: Omit<GetBookingsOptions, 'clubId' | 'trainerId' | 'userId'> = {},
): Promise<Booking[]> =>
  apiGet<Booking[]>(
    `/bookings${query({
      scope: 'owner',
      ...faceQuery(options.face),
      scheduleId: options.scheduleId,
      status: options.status === undefined ? undefined : options.status.join(','),
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      offset: options.offset,
      limit: options.limit,
    })}`,
  );

// --- Прочие коллекции -----------------------------------------------------------

/**
 * Отзывы. Без отбора — все; с лицом — только его.
 *
 * ⚠️ Шаг 35.31. Кабинет лица берёт отзывы ЭТОГО лица, а не все отзывы площадки,
 * чтобы отобрать своё в памяти. Раньше страница отзывов кабинета скачивала
 * выдачу целиком: её цена росла вместе с числом отзывов всех клубов сразу.
 */
export type GetReviewsOptions = { clubId?: EntityId; trainerId?: EntityId };

export const getReviews = (options: GetReviewsOptions = {}): Promise<Review[]> =>
  apiGet<Review[]>(`/reviews${query(options)}`);

/**
 * Люди площадки. Без признака — весь список, и он под правом администратора.
 *
 * ⚠️ Кабинету провайдера нужен режим `clients`: только те, кто к нему записывался.
 * Полный список ему не положен, а до фазы 34 страница брала именно его — ради
 * одного имени рядом с заявкой.
 */
export const getClientUsers = (): Promise<User[]> => apiGet<User[]>('/users?scope=clients');

/**
 * Человек площадки в админском списке: карточка плюс число его лиц услуг.
 *
 * ⚠️ Шаг 35.20a. Число приезжает ОТВЕТОМ, а не считается здесь по каталогу:
 * номер владельца (`managedByUserId`) из публичной выдачи ушёл — по нему кто
 * угодно строил карту «эти лица принадлежат одному человеку», скачав каталог
 * одним запросом. Админу владельцы положены по праву `manage_any_user`, и он
 * узнаёт их своим маршрутом, а не условным полем в публичном.
 */
export type AdminUser = User & { serviceFaceCount: number };

export const getUsers = (): Promise<AdminUser[]> => apiGet<AdminUser[]>('/users');

export type GetTrainerClubLinksOptions = {
  trainerId?: EntityId;
  clubId?: EntityId;
  status?: TrainerClubLink['status'];
};

export const getTrainerClubLinks = (
  options: GetTrainerClubLinksOptions = {},
): Promise<TrainerClubLink[]> => apiGet<TrainerClubLink[]>(`/trainer-club-links${query(options)}`);

export type GetNotificationsOptions = {
  userId?: EntityId;
  unreadOnly?: boolean;
  offset?: number;
  limit?: number;
  applyPreferences?: boolean;
  /** Тема ленты. Отбирает БАЗА: страница в сто строк отфильтровать очередь не может. */
  group?: NotificationGroupKey;
  /**
   * Ящик, который спрашивают (шаг 35.47a, обязателен с 37.42).
   *
   * ⚠️ Появился не для красоты. Уведомления переехали на ЛИЦО ещё в 35.27, и бэкенд
   * умеет отдавать ящик каждого лица отдельно — а страница кабинета продолжала
   * спрашивать ленту ЧЕЛОВЕКА целиком. То есть у владельца трёх клубов все три
   * кабинета показывали одну и ту же кучу.
   *
   * Ровно та ошибка, ради которой затевалась фаза 34: серверная часть написана
   * и покрыта тестами, а вызова из браузера нет ни одного, и снаружи разделения
   * не существует.
   *
   * ⚠️ Шаг 37.42 сделал поле ОБЯЗАТЕЛЬНЫМ, и это главное здесь изменение.
   * Прежде необязательное поле означало «ящик не назван», а не названный ящик
   * превращался в `?scope=all` — режим «вся лента площадки в память», который
   * с шага 37.19 отвечает отказом. То есть самый дорогой промах этой работы —
   * забыть параметр — выглядел как обычный вызов и ловился только на глаз.
   * Теперь он не собирается: «ящик не назван» стало невыразимо (решение 5.3a).
   */
  mailbox: NotificationsMailbox;
};

/**
 * Страница ленты — ровно то, что отдаёт маршрут.
 *
 * ⚠️ Форма ответа у уведомлений своя: счётчики лежат ВНУТРИ `data`
 * (`{ success, data: { items, total, unreadCount } }`), а не рядом с ним, как
 * у журнала и публикаций. Поэтому здесь возвращается `data` целиком, а не
 * читается поле конверта.
 */
export interface NotificationsFeedPage {
  items: Notification[];
  total: number;
  unreadCount: number;
}

/**
 * Страница ленты названного ящика.
 *
 * ⚠️ Шаг 37.42. Функция возвращает КОНВЕРТ, а не один `items`. Прежняя редакция
 * брала из ответа только строки и молча выбрасывала `total` и `unreadCount` —
 * постраничность надзорной вкладки строить было не из чего, а попытка посчитать
 * число страниц по длине выданной страницы дала бы ровно дефект фазы 36
 * «счётчик показывал вечный ноль, потому что читал `total` не оттуда».
 *
 * Считать обязан тот, у кого есть все строки. У страницы их пятнадцать.
 */
export async function getNotifications(
  options: GetNotificationsOptions,
): Promise<NotificationsFeedPage> {
  const path = `/notifications${query({
    userId: options.userId,
    unreadOnly: options.unreadOnly,
    offset: options.offset,
    limit: options.limit,
    group: options.group,
    // Имя параметра ящика пишется буквами ровно в одном месте проекта.
    ...mailboxParams(options.mailbox),
  })}`;

  return apiGet<NotificationsFeedPage>(path);
}

/**
 * Сколько непрочитанных в НАЗВАННОМ ящике (шаг 37.57).
 *
 * ⚠️ Заведено вместо счёта по ленте. Сводка кабинета брала страницу выдачи
 * (потолок — сто строк) и считала непрочитанные фильтром в памяти: после сотни
 * уведомлений число молча занижалось, и отказ был тихим — страница рисуется,
 * цифра просто меньше правды. Считать обязан тот, у кого есть все строки.
 *
 * ⚠️ Второго способа считать это число не заводится. Маршрут тот же самый,
 * которым живёт колокольчик, и ящик называется теми же параметрами, что у ленты:
 * разойтись условиям негде, а именно их расхождение трижды давало
 * «в колокольчике 3, в списке 0» (ловушка 7.8 фазы 35, шаг 36.50).
 *
 * ⚠️ Шаг 37.42. Ящик стал обязательным по той же причине, что и у ленты: ящик
 * без имени — это «всё моё», и счётчик надзора, у которого имя забыли, показал бы
 * личную почту администратора, то есть вечный ноль.
 */
export async function getUnreadNotificationsCount(mailbox: NotificationsMailbox): Promise<number> {
  const payload = await apiGet<{ unreadCount: number }>(
    `/notifications/unread-count${query(mailboxParams(mailbox))}`,
  );

  return payload.unreadCount;
}

/**
 * CRM-заметки ТЕКУЩЕГО провайдера обо всех его клиентах.
 *
 * ⚠️ Раньше вызов шёл с `?scope=all`, и это был режим «все заметки всех провайдеров
 * обо всех клиентах» — самые чувствительные данные площадки, открытые кому угодно.
 * Режим убран в шаге 34.25 совсем, а не закрыт правом: умолчание маршрута отдаёт
 * ровно то, ради чего его звали, — свои заметки, найденные по владельцу сессии.
 * Параметр маршрут молча игнорирует, поэтому он и дожил до сих пор незамеченным;
 * убран здесь, чтобы вызов не выглядел просьбой о том, чего больше нет.
 */
export const getAllProviderClientNotes = (): Promise<ProviderClientNote[]> =>
  apiGet<ProviderClientNote[]>('/provider-client-notes');
