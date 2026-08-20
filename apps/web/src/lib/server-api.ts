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
async function apiGet<T>(path: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_ORIGIN}/api${path}`, { cache: 'no-store' });
  } catch {
    // Соединения нет вовсе: бэкенд не поднят, база недоступна, сеть отвалилась.
    throw new BackendUnavailableError(path);
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
    response = await fetch(`${API_ORIGIN}/api${path}`, { cache: 'no-store' });
  } catch {
    throw new BackendUnavailableError(path);
  }

  if (response.status === 404) return null;

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

// --- Справочники ---------------------------------------------------------------

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

export async function getClubById(id: EntityId): Promise<Club | null> {
  const clubs = await getClubs();

  return clubs.find((club) => club.id === id) ?? null;
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
 * Записи с отбором.
 *
 * Без указания атлета маршрут требует явного признака полного среза — иначе он
 * отвечает отказом. Это защита от забытого параметра: запрос без единого условия
 * не должен случайно превращаться в выдачу всей площадки.
 */
export const getBookingsWhere = (options: GetBookingsOptions = {}): Promise<Booking[]> =>
  apiGet<Booking[]>(
    `/bookings${query({
      ...(options.userId === undefined ? { scope: 'all' } : { userId: options.userId }),
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
 * Записи нескольких владельцев одним набором.
 *
 * Маршрут принимает ОДНОГО владельца за запрос, а у провайдера их бывает несколько —
 * поэтому запросы идут веером и сливаются здесь. Число запросов равно числу публикаций
 * провайдера (в кабинете это единицы), а не числу записей площадки, поэтому размен
 * в нужную сторону: раньше был один запрос на всю платформу.
 *
 * Слияние идёт по номеру: клуб-владелец и клуб-площадка могут вернуть одну и ту же
 * запись дважды, и без склейки страница показала бы дубль.
 */
export async function getBookingsForOwners(
  owners: { clubIds?: readonly EntityId[]; trainerIds?: readonly EntityId[] },
  options: Omit<GetBookingsOptions, 'clubId' | 'trainerId' | 'userId'> = {},
): Promise<Booking[]> {
  const requests = [
    ...(owners.clubIds ?? []).map((clubId) => getBookingsWhere({ ...options, clubId })),
    ...(owners.trainerIds ?? []).map((trainerId) => getBookingsWhere({ ...options, trainerId })),
  ];

  if (requests.length === 0) return [];

  return mergeBookingsById(...(await Promise.all(requests)));
}

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

export const getReviews = (): Promise<Review[]> => apiGet<Review[]>('/reviews');

export const getUsers = (): Promise<User[]> => apiGet<User[]>('/users');

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
};

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
        })}`;

  const payload = await apiGet<{ items: Notification[] }>(path);

  return payload.items;
}

export const getAllProviderClientNotes = (): Promise<ProviderClientNote[]> =>
  apiGet<ProviderClientNote[]>(`/provider-client-notes${query({ scope: 'all' })}`);
