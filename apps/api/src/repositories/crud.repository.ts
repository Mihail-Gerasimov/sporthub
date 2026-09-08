// Репозитории простых доменов: логи, отзывы, пользователи, CRM-заметки.
//
// Здесь только границы: токены внедрения, интерфейсы и типы запросов. Реализация
// одна и живёт в `prisma/crud.repository.ts`. Файловая реализация вместе с общими
// мелочами вроде среза страницы в памяти удалена в фазе 34 — отбор, порядок
// и постраничность выполняет запрос, резать в памяти больше нечего.
//
// Тексты ошибок — часть контракта: на них завязаны маршруты, которые превращают
// сообщение в код ответа, и тесты, сравнивающие строку посимвольно.

import type { LogAction, LogEntry, ProviderClientNote, Review, User } from '@sporthub/types';

// --- Токены внедрения ---------------------------------------------------------

export const LOGS_REPOSITORY = Symbol('LOGS_REPOSITORY');
export const REVIEWS_REPOSITORY = Symbol('REVIEWS_REPOSITORY');
export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
export const PROVIDER_CLIENT_NOTES_REPOSITORY = Symbol('PROVIDER_CLIENT_NOTES_REPOSITORY');

// --- Интерфейсы ---------------------------------------------------------------

/**
 * Отбор журнала. Все поля необязательные: маршрут вправе не задать ни одного.
 *
 * Отбор и постраничность живут ЗДЕСЬ, а не в контроллере, намеренно. Раньше журнал
 * читался целиком, фильтровался в памяти и резался срезом массива — то есть каждая
 * страница админки поднимала в память весь журнал платформы. На базе тот же набор
 * полей превращается в `WHERE` + `LIMIT/OFFSET`, и цена страницы перестаёт зависеть
 * от размера журнала.
 */
export interface LogsQuery {
  action?: LogAction;
  actorId?: number;
  /** Нижняя граница метки времени, включительно. */
  from?: string;
  /** Верхняя граница метки времени, включительно. */
  to?: string;
  offset?: number;
  limit?: number;
}

/** Страница журнала: сама выдача и общее число подошедших записей. */
export interface LogsPage {
  items: LogEntry[];
  total: number;
}

/**
 * Строка суточной группировки: день и сколько записей на него пришлось.
 *
 * День — в UTC, `YYYY-MM-DD`: ровно первые десять символов метки времени, как их
 * резала сводка платформы. Другой пояс сдвинул бы график на сутки, поэтому
 * пояс здесь зафиксирован и в файловой реализации, и в реализации на базе.
 */
export interface DailyCount {
  date: string;
  count: number;
}

/**
 * Ограничение по публикациям-адресатам: «относится хотя бы к одной из этих».
 *
 * Своего города у записей и отзывов нет, поэтому отбор по городу сводка выражает
 * через уже отобранные клубы и тренеров. Наличие поля означает, что ограничение
 * применяется; ПУСТЫЕ наборы означают «никто не подошёл», а не «ограничения нет» —
 * иначе фильтр по городу без публикаций молча превратился бы в отсутствие фильтра.
 */
export interface OwnerIdFilter {
  clubIds: number[];
  trainerIds: number[];
}

export interface LogsRepository {
  findAll(): Promise<LogEntry[]>;
  /** Отобранная и порезанная страница журнала — оба действия уходят в запрос. */
  findPage(query: LogsQuery): Promise<LogsPage>;
  /**
   * Активность платформы по дням: сколько записей журнала пришлось на каждый день.
   *
   * Считает база, а не сводка. Журнал — самая быстрорастущая таблица проекта, и он
   * не чистится: сводка ломалась бы не от числа пользователей, а от времени работы
   * системы. Группировка возвращает по строке на день, а не по строке на событие.
   *
   * Дни идут по возрастанию. `fromDate` — нижняя граница ДНЯ, включительно.
   */
  countByDate(query: { fromDate?: string }): Promise<DailyCount[]>;
  insert(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry>;
}

/** Отбор отзывов для подсчёта. Все поля необязательные. */
export interface ReviewsCountFilter {
  /** Нижняя граница дня создания, включительно, `YYYY-MM-DD`. */
  fromDate?: string;
  /** Ограничение по адресатам: отзыв относится к одной из перечисленных публикаций. */
  owners?: OwnerIdFilter;
}

/**
 * Отбор отзывов. Порядок — часть отбора, а не дело потребителя.
 *
 * ⚠️ Раньше репозиторий отдавал отзывы по номеру, и все три потребителя тут же
 * пересортировывали их «свежие первыми» в памяти. Индексы `[clubId, createdAt desc]`
 * и `[trainerId, createdAt desc]` при этом работали только префиксом: хвост ключа
 * не использовался, потому что базу об этом порядке никто не просил.
 */
export type ReviewsFilter = {
  clubId?: number;
  trainerId?: number;
  /** `newest` — свежие первыми, тай-брейкер по номеру. Умолчание — по номеру. */
  order?: 'id' | 'newest';
};

export interface ReviewsRepository {
  findAll(): Promise<Review[]>;
  findMany(filter: ReviewsFilter): Promise<Review[]>;
  /** Сколько отзывов подошло под отбор. Считает запрос, а не длина массива. */
  count(filter: ReviewsCountFilter): Promise<number>;
  insert(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review>;
  removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number>;
}

export interface UsersRepository {
  findAll(): Promise<User[]>;
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /**
   * Сколько пользователей в каждой роли: ключ — роль, значение — число.
   *
   * Роль не перечисляется здесь списком намеренно: словарь ролей объявлен один раз
   * в `@sporthub/types`, и новая роль не должна требовать правки репозитория.
   * Роли без единого пользователя в ответе отсутствуют.
   */
  countByRole(): Promise<Record<string, number>>;
  insert(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  update(id: number, patch: Partial<User>): Promise<User>;
}

export interface ProviderClientNotesRepository {
  findAll(): Promise<ProviderClientNote[]>;
  findById(id: number): Promise<ProviderClientNote | null>;
  findMany(filter: {
    providerUserId: number;
    clientUserId?: number;
  }): Promise<ProviderClientNote[]>;
  insert(
    note: Omit<ProviderClientNote, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProviderClientNote>;
  update(id: number, patch: { note?: string; bookingId?: number }): Promise<ProviderClientNote>;
  remove(id: number): Promise<void>;
}
