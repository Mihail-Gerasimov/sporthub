// Лица услуг и кабинеты, которые им соответствуют.
//
// ⚠️ Фаза 35 убрала «тип кабинета». Раньше человек был ЛИБО спортсменом, ЛИБО
// представителем услуг, и весь фронт спрашивал этот тип. В жизни это один и тот
// же человек: у него есть свой зал И он сам ходит на йогу. Поэтому вместо
// признака — список фактов: какими лицами услуг он управляет.
//
// ⚠️ Шаг 35.31 довёл это до адресов. Кабинет лица стал АДРЕСНЫМ: в пути стоит
// номер лица, а значит владелец трёх клубов может дать ссылку на кабинет одного
// из них, а серверный лейаут — сверить этот номер со списком лиц из сессии
// (`requireOwner`). Пока номера в адресе не было, сверять было нечего: кабинет
// пускал по «есть хотя бы одно лицо».
//
// Модуль намеренно НЕ серверный (в отличие от `session.ts`): типом лица и
// адресами кабинетов пользуются и страницы, и браузерный стор. Одно объявление
// на всех — иначе адрес кабинета разъехался бы между шапкой и лейаутом молча.

import type { EntityStatus } from '@sporthub/types';

/**
 * Виды лиц услуг. Третий вид (площадка, мероприятие) добавляется сюда строкой —
 * и вместе с ним появляется его адрес `/profile/<вид>/<номер>`: маршрут кабинета
 * лица динамический по виду, отдельной папки под каждый вид нет.
 */
export const SERVICE_FACE_KINDS = ['club', 'trainer'] as const;

/** Вид лица услуг. */
export type ServiceFaceKind = (typeof SERVICE_FACE_KINDS)[number];

/**
 * Лицо услуг: карточка тренера или клуб, которым человек управляет.
 *
 * ⚠️ Архивированное лицо из этого списка НЕ пропадает, и это осознанно. Владелец,
 * убравший своё лицо, его не удалил: публикация ушла из каталога, а записи, отзывы
 * и связи остались, и вернуть её можно. Убрать лицо из списка значило бы отобрать
 * у владельца доступ к собственному кабинету вместе с этой возможностью.
 *
 * Поэтому лицо остаётся, но несёт свой `status` — кабинет обязан сказать вслух,
 * что публикации нет в каталоге. Без этого он выглядел ровно как живой, и человек
 * не понимал, почему его клуба нигде не видно.
 */
export type ServiceFace = {
  kind: ServiceFaceKind;
  id: number;
  name: string;
  /** `hidden` — лицо убрано из каталога: архивировано владельцем или скрыто модерацией. */
  status?: EntityStatus;
};

/** Убрано ли лицо из каталога. Одно объявление на весь фронт. */
export function isFaceArchived(face: ServiceFace): boolean {
  return face.status === 'hidden';
}

/** Ссылка на лицо без его имени — ровно то, что несёт адрес кабинета. */
export type ServiceFaceRef = {
  kind: ServiceFaceKind;
  id: number;
};

/** Корень всех кабинетов. Отсюда собираются оба адреса ниже. */
export const PROFILE_ROOT = '/profile';

/**
 * Адрес личного кабинета человека — записи, отзывы, избранное.
 *
 * Номера в нём нет и не будет: человек в сессии ровно один, и «чужого себя»
 * в адресе не выразить.
 */
export const PERSONAL_CABINET_PATH = `${PROFILE_ROOT}/me`;

/**
 * Адрес кабинета лица услуг.
 *
 * ⚠️ Функция, а не константа: кабинет принадлежит ЛИЦУ, а не человеку. Из этого
 * адреса лейаут достаёт вид и номер и сверяет их со списком лиц сессии.
 */
export function faceCabinetPath(face: ServiceFaceRef): string {
  return `${PROFILE_ROOT}/${face.kind}/${face.id}`;
}

/** Раздел, на который смотрит корень любого кабинета. */
export const DEFAULT_CABINET_SECTION = 'dashboard';

/** Собрать адрес раздела кабинета: `/profile/me/reviews`, `/profile/club/3/bookings`. */
export function cabinetSectionPath(cabinetPath: string, section: string): string {
  return `${cabinetPath}/${section}`;
}

/**
 * Разобрать вид лица из сегмента адреса. `null` — такого вида нет.
 *
 * Проверка по словарю, а не по «строка непустая»: `/profile/venue/5` обязан
 * получить отказ, пока вида «площадка» в системе нет, — иначе адрес молча
 * дошёл бы до проверки владения и получил бы там отказ по другой причине.
 */
export function parseServiceFaceKind(raw: string): ServiceFaceKind | null {
  return (SERVICE_FACE_KINDS as readonly string[]).includes(raw) ? (raw as ServiceFaceKind) : null;
}

/**
 * Разобрать адрес кабинета лица. `null` — адрес не про лицо услуг.
 *
 * Номер обязан быть целым положительным: `/profile/club/abc` и `/profile/club/0`
 * это не «лицо, которого нет у человека», а мусор в адресе, и различать их надо
 * здесь, до любого похода за данными.
 */
export function parseFaceCabinetParams(raw: {
  faceKind: string;
  faceId: string;
}): ServiceFaceRef | null {
  const kind = parseServiceFaceKind(raw.faceKind);

  if (kind === null) return null;

  const id = Number(raw.faceId);

  if (!Number.isInteger(id) || id <= 0) return null;

  return { kind, id };
}

/**
 * Прежние адреса кабинетов — до шага 35.31.
 *
 * Оставлены НЕ для совместимости кода (ни одна ссылка на них больше не ведёт),
 * а для людей: эти адреса лежат у них в закладках и разосланы письмами
 * уведомлений. Маршруты по ним живы и уводят на новые — см. комментарии
 * в `app/profile/athlete` и `app/profile/provider`.
 */
export const LEGACY_PERSONAL_CABINET_PATH = `${PROFILE_ROOT}/athlete`;
export const LEGACY_FACE_CABINET_PATH = `${PROFILE_ROOT}/provider`;

/**
 * Раздел из хвоста прежнего адреса. Пустой хвост — обзор.
 *
 * `/profile/athlete` → `dashboard`, `/profile/athlete/reviews` → `reviews`.
 * Разделы у обоих кабинетов сохранили имена, поэтому перенос — это замена
 * начала адреса, а не таблица соответствий.
 */
export function legacyCabinetSection(rest: string[] | undefined): string {
  const section = (rest ?? []).join('/').trim();

  return section === '' ? DEFAULT_CABINET_SECTION : section;
}

/** Подпись личного кабинета. */
export const PERSONAL_CABINET_TITLE = 'Кабинет спортсмена';

/** Подпись кабинета лица, когда имя лица ещё неизвестно. */
export const FACE_CABINET_TITLE = 'Кабинет представителя спортивных услуг';

/**
 * Куда ведёт кабинет и как он подписан.
 *
 * `face === null` — личный кабинет человека; иначе кабинет конкретного лица.
 */
export type CabinetTarget = {
  /** Устойчивый ключ: `me` либо `club:3` / `trainer:7`. */
  key: string;
  title: string;
  href: string;
  face: ServiceFace | null;
};

/** Ключ лица: им лицо опознаётся в разметке, в состоянии и в тестах. */
export function faceKey(face: ServiceFaceRef): string {
  return `${face.kind}:${face.id}`;
}

/** Найти лицо по ключу. `null` — такого лица у человека нет. */
export function findFace(faces: readonly ServiceFace[], key: string | null): ServiceFace | null {
  if (key === null) return null;

  return faces.find((face) => faceKey(face) === key) ?? null;
}

/** Найти лицо по виду и номеру из адреса. `null` — этим лицом человек не управляет. */
export function findFaceByRef(
  faces: readonly ServiceFace[],
  ref: ServiceFaceRef,
): ServiceFace | null {
  return faces.find((face) => face.kind === ref.kind && face.id === ref.id) ?? null;
}

/** Кабинет одного лица услуг. */
export function faceCabinet(face: ServiceFace): CabinetTarget {
  return { key: faceKey(face), title: face.name, href: faceCabinetPath(face), face };
}

/** Личный кабинет человека — один на всех и от лиц не зависит. */
export const PERSONAL_CABINET: CabinetTarget = {
  key: 'me',
  title: PERSONAL_CABINET_TITLE,
  href: PERSONAL_CABINET_PATH,
  face: null,
};
