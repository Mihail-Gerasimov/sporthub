/**
 * Куда ведёт уведомление: адрес ленты и адрес самого предмета — оба зависят
 * от МЕСТА, из которого на уведомление смотрят (шаги 37.50 и 37.53).
 *
 * ⚠️ Пара «вид предмета + номер» лежит в уведомлениях с фазы 36, и до шага 37.53
 * фронт её не читал ВООБЩЕ: оба читателя были серверные. Поэтому здесь не
 * «подключение готового», а первая на проекте карта переходов.
 *
 * ⚠️ Зачем «место» вообще понадобилось. Одно и то же уведомление читают двое,
 * и предмет у них открывается по-разному: владелец клуба из своего кабинета
 * идёт к СВОЕЙ карточке, администратор из служебной панели — к карточке
 * МОДЕРАЦИИ той же публикации. Пока адрес собирался по месту вызова, это
 * различие жило в разметке двух лент, и третья лента завела бы третью копию.
 *
 * ⚠️ Место — размеченный union, а не строка `'cabinet' | 'panel'`. Кабинетов
 * у человека столько, сколько у него лиц услуг, и «кабинет» без указания
 * какого — это половина адреса. Панели, наоборот, хватает самого вида: она
 * в проекте одна.
 */

import { readNotificationSubject } from '@sporthub/domain';
import type { Notification, NotificationSubject, NotificationSubjectType } from '@sporthub/types';

import { MODERATION_DEFAULT_FILTERS, moderationAddressQuery } from '@/lib/moderation-filters';
import {
  cabinetSectionPath,
  faceCabinetPath,
  type CabinetTarget,
  type ServiceFaceKind,
} from '@/lib/service-faces';
import { SERVICE_PORTAL_SECTIONS } from '@/lib/service-portal-sections';

/**
 * Место, из которого смотрят на уведомление: кабинет лица (или личный)
 * либо служебная панель.
 */
export type NotificationPlace = { kind: 'panel' } | { kind: 'cabinet'; cabinet: CabinetTarget };

/**
 * Служебная панель как место. Константа, а не литерал на месте вызова: литерал
 * был бы новой ссылкой на каждый рендер, и зависимости хуков пересчитывались бы
 * впустую — ровно та же причина, что у `PERSONAL_MAILBOX`.
 */
export const PANEL_PLACE: NotificationPlace = { kind: 'panel' };

/** Кабинет как место. Какой именно кабинет открыт — часть адреса, а не деталь. */
export function cabinetPlace(cabinet: CabinetTarget): NotificationPlace {
  return { kind: 'cabinet', cabinet };
}

/**
 * Адрес полной ленты уведомлений в этом месте.
 *
 * ⚠️ Третий случай адреса (шаг 37.50). У служебной записи кабинета нет ни одного:
 * `selectPrimaryCabinet` отдаёт ей `null`, и адрес, собранный от него, уезжал бы
 * в `/profile/me/notifications`, откуда `requirePerson()` выбрасывает на главную.
 * Колокольчик при этом выглядел бы работающим — выкидывал бы только клик.
 */
export function notificationsFeedHref(place: NotificationPlace): string {
  return place.kind === 'panel'
    ? SERVICE_PORTAL_SECTIONS.supervision
    : cabinetSectionPath(place.cabinet.href, 'notifications');
}

/**
 * Адрес публикации: своя карточка в кабинете, карточка модерации в панели.
 *
 * ⚠️ Публичная страница публикации здесь не годится: она адресуется слагом,
 * а в уведомлении лежит НОМЕР. Кабинет и панель адресуются номером оба — потому
 * переход и ведёт к рабочей карточке, а не к витрине.
 */
function publicationHref(kind: ServiceFaceKind, id: number, place: NotificationPlace): string {
  if (place.kind === 'panel') {
    // Отбор раздела модерации собирается его же словарём: имена параметров
    // адреса объявлены там один раз, и второго написания здесь быть не должно.
    const query = moderationAddressQuery({
      ...MODERATION_DEFAULT_FILTERS,
      type: kind,
      focusId: id,
    });

    return `${SERVICE_PORTAL_SECTIONS.moderation}?${query}`;
  }

  // Своя карточка живёт в кабинете САМОГО лица, а не в том кабинете, из которого
  // пришли: уведомление про клуб №3 открывается в кабинете клуба №3, кем бы
  // ни был открыт соседний.
  return cabinetSectionPath(faceCabinetPath({ kind, id }), 'publications');
}

/**
 * Карта «вид предмета → адрес». Полная по видам предмета намеренно:
 * `Record` не даст забыть седьмой вид, когда он появится в словаре домена.
 *
 * `null` — в ЭТОМ месте предмет не открывается. Это честный ответ, а не пропуск:
 * раздела записей, отзывов и связей в служебной панели нет вовсе, и мёртвая
 * ссылка туда была бы хуже её отсутствия.
 */
const SUBJECT_ADDRESS: Record<
  NotificationSubjectType,
  (id: number, place: NotificationPlace) => string | null
> = {
  club: (id, place) => publicationHref('club', id, place),
  trainer: (id, place) => publicationHref('trainer', id, place),

  // Записи: в кабинете лица это раздел заявок, в личном — расписание человека.
  // ⚠️ Номер записи в адрес не попадает: наводку на строку эти разделы пока
  // не принимают, и адрес ведёт в раздел, где предмет лежит. Наводка — работа
  // того же вида, что шаг 37.54 сделал для модерации, и она в этой не входит.
  booking: (_id, place) =>
    place.kind === 'panel'
      ? null
      : cabinetSectionPath(
          place.cabinet.href,
          place.cabinet.face === null ? 'schedule' : 'bookings',
        ),

  // Отзывы есть у обоих кабинетов — и у лица, и у человека.
  review: (_id, place) =>
    place.kind === 'panel' ? null : cabinetSectionPath(place.cabinet.href, 'reviews'),

  // Связи «тренер ↔ клуб» живут только у лица услуг: человеку связываться нечем.
  link: (_id, place) =>
    place.kind === 'panel' || place.cabinet.face === null
      ? null
      : cabinetSectionPath(place.cabinet.href, 'links'),

  // Человек как предмет бывает только у надзорных типов, и смотрят на него
  // только из панели. В кабинете такого уведомления не бывает вовсе.
  user: (_id, place) => (place.kind === 'panel' ? SERVICE_PORTAL_SECTIONS.users : null),
};

/**
 * Адрес предмета уведомления. `null` — в этом месте предмет не открывается.
 */
export function subjectHref(subject: NotificationSubject, place: NotificationPlace): string | null {
  return SUBJECT_ADDRESS[subject.subjectType](subject.subjectId, place);
}

/**
 * Типы уведомлений, чей предмет стирает само событие (шаг 37.55).
 *
 * ⚠️ Это НЕ «данные не приехали». Надзорная строка переживает свой предмет
 * по построению: событие «публикация стёрта» существует именно потому, что
 * публикации больше нет. Переход отсюда обязан дать понятный ответ — не 404
 * и не пустой раздел, в котором человек будет искать, какой фильтр съел карточку.
 *
 * Словарь частичный намеренно: перечислять здесь все три десятка типов
 * уведомлений значило бы объявить «предмет цел» три десятка раз.
 */
const ERASED_SUBJECT_NOTE: Partial<Record<Notification['type'], string>> = {
  oversight_publication_deleted: 'Публикация стёрта безвозвратно — открывать больше нечего.',
  oversight_booking_hard_deleted: 'Запись стёрта безвозвратно — открывать больше нечего.',
};

/**
 * Чем кончается попытка перейти из строки уведомления к его предмету.
 *
 * Три исхода, а не «ссылка или ничего»: «предмета больше нет» и «здесь его
 * не открыть» — разные ответы, и человеку их надо различать. Сведи мы их в один,
 * администратор, ткнувший в строку про стёртую публикацию, решил бы, что
 * интерфейс сломан.
 */
export type NotificationTarget =
  | { kind: 'open'; href: string }
  | { kind: 'gone'; note: string }
  | { kind: 'none' };

/** Тот же ответ, но по целому уведомлению: предмет читается из его `payload`. */
export function notificationTarget(
  notification: Notification,
  place: NotificationPlace,
): NotificationTarget {
  const erased = ERASED_SUBJECT_NOTE[notification.type];

  if (erased !== undefined) return { kind: 'gone', note: erased };

  const subject = readNotificationSubject(notification.payload);

  if (subject === null) return { kind: 'none' };

  const href = subjectHref(subject, place);

  return href === null ? { kind: 'none' } : { kind: 'open', href };
}
