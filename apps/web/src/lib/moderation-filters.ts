// Отбор раздела модерации: один разбор параметров адреса и одна сборка запроса.
//
// ⚠️ Шаг 37.54. До него раздел не принимал параметров адреса ВОВСЕ — весь отбор
// жил в локальном состоянии компонента. Это закрывало быстрый переход из надзорной
// ленты («публикация скрыта» → карточка этой публикации): ссылку было не из чего
// построить, а открытый раздел всегда начинался с чистого листа.
//
// ⚠️ Почему отдельный модуль, а не `searchParams.get(...)` по месту. Параметров
// восемь, читателей у каждого двое (отрисовка селекта и адрес запроса), и разбор
// по месту означал бы восемь пар решений «что считать негодным». Разъехались бы
// они молча: селект показывал бы «Все статусы», а в запрос уходил бы мусор из адреса.
// Здесь решение одно на параметр, и оно проверяется своим набором.
//
// ⚠️ Мусор в адресе не роняет раздел и не показывает ошибку: негодное значение
// ведёт себя как ОТСУТСТВУЮЩЕЕ. Адрес пишет кто угодно — человек руками, старая
// ссылка из письма, чужой переход; раздел модерации обязан открыться в любом случае.

import { SERVICE_FACE_KINDS, type ServiceFaceKind } from '@/lib/service-faces';

/**
 * Читатель параметров адреса.
 *
 * Объявлен интерфейсом, а не типом Next: сюда одинаково подходит
 * `ReadonlyURLSearchParams` из `useSearchParams()` и обычный `URLSearchParams`
 * из теста или из серверного разбора. Модулю не нужно знать, кто его позвал.
 */
export interface ModerationQueryReader {
  get(name: string): string | null;
}

/** Размер страницы раздела. Общий с `Logs` и `Users` (фаза 28.19). */
export const MODERATION_PAGE_SIZE = 15;

/** Состояние публикации в отборе. `all` — состояние не ограничиваем. */
export const MODERATION_STATUS_VALUES = ['all', 'published', 'hidden'] as const;
export type ModerationStatus = (typeof MODERATION_STATUS_VALUES)[number];

/**
 * Вид публикации в отборе.
 *
 * Словарь видов берётся из `SERVICE_FACE_KINDS` — второго объявления «клуб или
 * тренер» в проекте быть не должно: третий вид лица услуг добавится одной строкой
 * там, и отбор модерации примет его без правки здесь.
 */
export const MODERATION_TYPE_VALUES = ['all', ...SERVICE_FACE_KINDS] as const;
export type ModerationType = 'all' | ServiceFaceKind;

/**
 * Очередь повторной проверки. Не значение состояния: признак живёт ПОВЕРХ скрытия,
 * поэтому у него свой параметр, а не третье значение `status`.
 */
export const MODERATION_RECHECK_VALUES = ['all', 'awaiting'] as const;
export type ModerationRecheck = (typeof MODERATION_RECHECK_VALUES)[number];

/** Полный отбор раздела: ровно то, что несёт адрес. */
export interface ModerationFilters {
  status: ModerationStatus;
  type: ModerationType;
  recheck: ModerationRecheck;
  city: string;
  /** Номер вида спорта строкой — так же, как его хранит `<select>`. */
  sportId: string;
  search: string;
  /** Страница с единицы: в адресе человеческая нумерация, в запросе — смещение. */
  page: number;
  /** Номер публикации, на которую наводит уведомление. `null` — обычный просмотр. */
  focusId: number | null;
}

/** Отбор раздела, открытого из меню: ничего не ограничено, первая страница. */
export const MODERATION_DEFAULT_FILTERS: ModerationFilters = {
  status: 'all',
  type: 'all',
  recheck: 'all',
  city: '',
  sportId: '',
  search: '',
  page: 1,
  focusId: null,
};

/** Значение из словаря или умолчание. Чужое значение — как отсутствующее. */
function fromDictionary<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

/**
 * Целое положительное число или `null`.
 *
 * Строго: `Number` считает числами и пустую строку, и `1e3`, и ` 5 `. Номер
 * публикации и номер страницы приходят из адреса, где это всё — мусор.
 */
function positiveInteger(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;

  const value = Number(raw);

  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Отбор из адреса. Адрес — источник правды: локального состояния отбора у раздела
 * не остаётся, иначе часть отбора жила бы в адресе, часть в памяти, и они разошлись бы.
 */
export function parseModerationFilters(params: ModerationQueryReader): ModerationFilters {
  const focusId = positiveInteger(params.get('id'));
  const type = fromDictionary(params.get('type'), MODERATION_TYPE_VALUES, 'all');

  // ⚠️ Наводка на публикацию раздвигает весь остальной отбор, и это не упрощение.
  // Номер в адресе — просьба показать КОНКРЕТНУЮ публикацию, а она может быть
  // скрытой модератором, архивированной владельцем, любой. Сохрани мы здесь
  // состояние или город из адреса — пришедший по ссылке из уведомления увидел бы
  // пустой раздел и не понял, какой фильтр съел его публикацию.
  //
  // Вид публикации остаётся: он не прячет предмет, а сужает выдачу до нужной
  // таблицы — клубы и карточки тренеров нумеруются независимо.
  if (focusId !== null) {
    return { ...MODERATION_DEFAULT_FILTERS, type, focusId };
  }

  return {
    status: fromDictionary(params.get('status'), MODERATION_STATUS_VALUES, 'all'),
    type,
    recheck: fromDictionary(params.get('recheck'), MODERATION_RECHECK_VALUES, 'all'),
    // Город — данные, а не словарь: любой непустой текст годится, отбор сделает база.
    city: params.get('city') ?? '',
    // Вид спорта — номер. Нечисловое значение ушло бы в запрос как `NaN` и молча
    // отбора не дало бы; здесь оно просто отсутствует.
    sportId: positiveInteger(params.get('sportId')) === null ? '' : (params.get('sportId') ?? ''),
    search: params.get('search') ?? '',
    page: positiveInteger(params.get('page')) ?? 1,
    focusId: null,
  };
}

/**
 * Адрес раздела: в строку попадает только то, что отличается от умолчания.
 *
 * Открытый из меню раздел обязан иметь чистый адрес — иначе каждая ссылка на него
 * несла бы восемь параметров со значением «ничего не ограничено».
 */
export function moderationAddressQuery(filters: ModerationFilters): string {
  const params = new URLSearchParams();

  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.type !== 'all') params.set('type', filters.type);
  if (filters.recheck !== 'all') params.set('recheck', filters.recheck);
  if (filters.city) params.set('city', filters.city);
  if (filters.sportId) params.set('sportId', filters.sportId);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.focusId !== null) params.set('id', String(filters.focusId));

  return params.toString();
}

/**
 * Адрес запроса к `GET /api/publications`.
 *
 * ⚠️ Весь отбор и постраничность уходят В ЗАПРОС. Раздел, который просит всё
 * и разбирается сам, на экране выглядит точно так же — и именно так фаза 35
 * потеряла разделение по лицам в семи разделах кабинета.
 *
 * ⚠️ Имена здесь — имена КОНТРАКТА, а не адреса раздела: очередь повторной проверки
 * в адресе называется `recheck=awaiting`, а маршрут спрашивает `awaitingRecheck=true`.
 * Перевод живёт в одном месте — здесь.
 */
export function moderationRequestQuery(filters: ModerationFilters): string {
  const params = new URLSearchParams();

  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.type !== 'all') params.set('type', filters.type);
  if (filters.city) params.set('city', filters.city);
  if (filters.sportId) params.set('sportId', filters.sportId);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.recheck === 'awaiting') params.set('awaitingRecheck', 'true');
  // Наводка из уведомления — тоже условие отбора, и место ему в запросе.
  // Искать нужную публикацию среди выданных страница не имеет права: цена такого
  // поиска росла бы вместе с каталогом, а не с выдачей.
  if (filters.focusId !== null) params.set('id', String(filters.focusId));

  params.set('offset', String((filters.page - 1) * MODERATION_PAGE_SIZE));
  params.set('limit', String(MODERATION_PAGE_SIZE));

  return params.toString();
}

/**
 * Наведена ли строка выдачи — та ли это публикация, ради которой пришли.
 *
 * Вид проверяется вместе с номером: клубы и карточки тренеров нумеруются
 * независимо, и клуб №42 — не тренер №42.
 */
export function isFocusedPublication(
  filters: ModerationFilters,
  item: { id: number; type: ServiceFaceKind },
): boolean {
  if (filters.focusId === null || filters.focusId !== item.id) return false;

  return filters.type === 'all' || filters.type === item.type;
}
