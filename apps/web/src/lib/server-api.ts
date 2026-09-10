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

import type { ServiceFaceRef } from '@/lib/service-faces';
import type {
  Amenity,
  Booking,
  BookingStatus,
  City,
  Club,
  EntityId,
  ISODateString,
  Notification,
  Offering,
  ProviderClientNote,
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
export const getCities = (): Promise<City[]> => apiGet<City[]>('/cities');
export const getTags = (): Promise<Tag[]> => apiGet<Tag[]>('/tags');
export const getAmenities = (): Promise<Amenity[]> => apiGet<Amenity[]>('/amenities');
export const getSpecialties = (): Promise<Specialty[]> => apiGet<Specialty[]>('/specialties');
export const getWorkFormats = (): Promise<WorkFormat[]> => apiGet<WorkFormat[]>('/work-formats');

// --- Публикации ----------------------------------------------------------------

/** Полный список, включая скрытые: личным кабинетам нужны и они. */
export const getClubs = (): Promise<Club[]> =>
  apiGet<Club[]>(`/clubs${query({ includeHidden: true })}`);

export const getPublishedClubs = (): Promise<Club[]> => apiGet<Club[]>('/clubs');

export const getTrainers = (): Promise<Trainer[]> =>
  apiGet<Trainer[]>(`/trainers${query({ includeHidden: true })}`);

export const getPublishedTrainers = (): Promise<Trainer[]> => apiGet<Trainer[]>('/trainers');

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

export async function getTrainerById(id: EntityId): Promise<Trainer | null> {
  const trainers = await getTrainers();

  return trainers.find((trainer) => trainer.id === id) ?? null;
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
 * местах вместо него стоит `getBookingsWhere` со своим отбором.
 *
 * Автопереходы по времени бэкенд прогоняет сам при чтении, отдельного вызова нет.
 */
export const getBookings = (): Promise<Booking[]> =>
  apiGet<Booking[]>(`/bookings${query({ scope: 'all' })}`);

/**
 * Записи ОДНОГО атлета с дополнительным отбором.
 *
 * ⚠️ Атлет обязателен, и это главное свойство вызова. Раньше он был необязательным,
 * а пропуск молча подставлял `scope=all` — полный срез площадки. Пока тот режим
 * отдавался всем, забытый параметр выглядел как работающий код; после того как срез
 * ушёл под право администратора, каждое такое место превратилось в 403 и упавшую
 * страницу. Обязательность закрывает саму возможность повторить это: срез площадки
 * теперь просят только там, где написали его имя, — в `getBookings`.
 *
 * Номер атлета едет параметром, но чужие записи им не получить: маршрут его
 * игнорирует и отбирает по владельцу сессии. Здесь он остаётся как утверждение
 * вызывающего «мне нужны записи именно этого человека», и оно обязано совпадать
 * с тем, кто вошёл.
 */
export const getBookingsWhere = (
  options: GetBookingsOptions & { userId: EntityId },
): Promise<Booking[]> =>
  apiGet<Booking[]>(
    `/bookings${query({
      userId: options.userId,
      clubId: options.clubId,
      trainerId: options.trainerId,
      scheduleId: options.scheduleId,
      status: options.status === undefined ? undefined : options.status.join(','),
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      offset: options.offset,
      limit: options.limit,
    })}`,
  );

export const getBookingsByUser = (userId: EntityId): Promise<Booking[]> =>
  apiGet<Booking[]>(`/bookings${query({ userId })}`);

/**
 * Записи КЛИЕНТОВ текущего провайдера — вся история людей, ходивших к его публикациям.
 *
 * ⚠️ Это не то же самое, что записи публикаций провайдера (`getBookingsForOwners`).
 * Там записи на ЕГО занятия, здесь — история тех же людей целиком, включая занятия
 * у других провайдеров: бейдж надёжности рядом с клиентом считается по всей истории,
 * иначе прогулявший десять занятий у соседей выглядел бы у нас безупречным.
 *
 * Кто такой «текущий провайдер», решает сессия; публикации бэкенд находит сам.
 * Поэтому у вызова нет ни одного параметра личности — подставить чужого нечем.
 * Раньше эту историю добирал `?scope=all`, то есть срез всей площадки; с закрытием
 * того режима правом администратора он стал ещё и отказом для провайдера.
 */
export const getClientBookings = (
  options: Pick<GetBookingsOptions, 'face' | 'status' | 'dateFrom' | 'dateTo'> = {},
): Promise<Booking[]> =>
  apiGet<Booking[]>(
    `/bookings${query({
      scope: 'clients',
      ...faceQuery(options.face),
      status: options.status === undefined ? undefined : options.status.join(','),
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    })}`,
  );

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

/**
 * Слияние нескольких наборов записей в один, без повторов.
 *
 * Нужно везде, где страница собирает выдачу из нескольких запросов: один и тот же
 * ряд приходит и от клуба-владельца, и от клуба-площадки, и из истории атлета.
 * Порядок восстанавливается по номеру — тот же, в котором ряды отдаёт маршрут.
 */
export function mergeBookingsById(...chunks: Booking[][]): Booking[] {
  const byId = new Map<EntityId, Booking>();

  for (const chunk of chunks) {
    for (const booking of chunk) byId.set(booking.id, booking);
  }

  return [...byId.values()].sort((left, right) => left.id - right.id);
}

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

export async function getUserById(id: EntityId): Promise<User | null> {
  const users = await getUsers();

  return users.find((user) => user.id === id) ?? null;
}

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
  /**
   * Ящик, который спрашивают (шаг 35.47a).
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
   * Не задан — ящик человека целиком (прежнее поведение, старый клиент цел).
   */
  mailbox?: { scope: 'personal' } | ServiceFaceRef;
};

/** Ящик в виде параметров строки запроса — так его называет бэкенд. */
function mailboxQuery(mailbox: GetNotificationsOptions['mailbox']) {
  if (mailbox === undefined) return {};
  if ('scope' in mailbox) return { scope: mailbox.scope };

  return mailbox.kind === 'club' ? { clubId: mailbox.id } : { trainerId: mailbox.id };
}

export async function getNotifications(
  options: GetNotificationsOptions = {},
): Promise<Notification[]> {
  const path =
    options.userId === undefined
      ? `/notifications${query({ scope: 'all' })}`
      : `/notifications${query({
          userId: options.userId,
          unreadOnly: options.unreadOnly,
          offset: options.offset,
          limit: options.limit,
          ...mailboxQuery(options.mailbox),
        })}`;

  const payload = await apiGet<{ items: Notification[] }>(path);

  return payload.items;
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
