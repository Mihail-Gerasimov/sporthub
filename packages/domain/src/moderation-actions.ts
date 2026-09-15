// Словарь действий модерации публикаций (фаза 38, шаг 38.38).
//
// До этого шага контроллер модерации ветвился по действию в ВОСЬМИ местах:
// проверка значения, обязательность причины, выбор метода, действие журнала,
// его `meta`, надзорная строка, тип письма владельцу и причина в его тексте.
// Третье и четвёртое действие — подтверждение и отзыв проверки (Э6) — умножили бы
// каждую развилку, и следующее за ними — снова. Здесь всё, чем действия
// отличаются, собрано в ОДНУ строку словаря; контроллер читает её и не ветвится.
// Новое действие = строка здесь; компилятор потребует все шесть полей сам.
//
// ⚠️ Конвенция записи (`patch`): ключ со значением `undefined` означает
// «ОБНУЛИТЬ колонку», а не «не трогать». Так работает `update` репозиториев:
// у них есть список стираемых полей (`CLUB_ERASABLE_FIELDS`), и `hideReason:
// undefined` там превращается в `NULL`. Поле, которого в патче НЕТ, остаётся
// как было. Разница между «нет ключа» и «ключ с undefined» — и есть весь смысл.
//
// ⚠️ Домен чист: он не знает ни базы, ни времени, ни исполнителя. Всё это
// приходит в `patch` контекстом (`{ reason?, actorId, now }`), поэтому словарь
// проверяется без обвязки, а контроллер подставляет своё.

import type {
  EntityId,
  EntityStatus,
  HideKindValue,
  ISODateTimeString,
  LogAction,
  NotificationType,
} from '@sporthub/types';

/**
 * Действия модерации. Порядок значим только для текста отказа: он перечисляет
 * действия в этом порядке.
 *
 * Шаг 38.45 добавит `verify` и `unverify` — строками здесь и в словаре ниже.
 */
export const MODERATION_ACTIONS = ['hide', 'unhide'] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** Проверка значения, пришедшего в теле запроса. */
export function isModerationAction(value: unknown): value is ModerationAction {
  return typeof value === 'string' && (MODERATION_ACTIONS as readonly string[]).includes(value);
}

/**
 * Предварительные условия, проверяемые ПО ДАННЫМ до записи.
 *
 * Названы именами, а не функциями: домен данных не видит. Реализацию каждого
 * имени держит контроллер картой `Record<ModerationPrecondition, …>` —
 * новое имя здесь компилятор потребует реализовать там.
 *
 * `no_live_bookings` — у публикации нет живых будущих записей (36.19, решение 14):
 * скрытая исчезает из каталога, но уже созданную запись не отменяет, и человек
 * узнал бы о беде, придя к закрытой двери.
 */
export const MODERATION_PRECONDITIONS = ['no_live_bookings'] as const;

export type ModerationPrecondition = (typeof MODERATION_PRECONDITIONS)[number];

/** Что известно действию в момент записи. */
export type ModerationPatchContext = {
  /** Причина — уже проверенная и обрезанная; есть только там, где обязательна. */
  reason?: string;
  /** НАСТОЯЩИЙ исполнитель: под работой от чужого лица — администратор, а не лицо. */
  actorId: EntityId;
  now: Date;
};

/**
 * Поля публикации, которые модерация вправе менять. Общие у клуба и тренера —
 * словарь один на обоих. См. конвенцию обнуления в шапке.
 */
export type ModerationPatch = {
  status?: EntityStatus;
  hideReason?: string;
  hiddenByUserId?: EntityId;
  hiddenAt?: ISODateTimeString;
  hiddenKind?: HideKindValue;
  awaitingRecheck?: boolean;
};

export type ModerationActionSpec = {
  /** Действие журнала — след с исполнителем и причиной. */
  logAction: LogAction;
  /**
   * Нужна ли причина в теле запроса. `false` — не нужна; строка — текст отказа,
   * когда причина не пришла. Тексты живут здесь, а не в контроллере: они часть
   * контракта (`error-messages.test.ts`), и словарь — их единственное место.
   */
  requiresReason: false | string;
  /**
   * Строка в ОБЩУЮ очередь надзора — или `null`. Очередь не журнал: она про то,
   * что требует внимания второго администратора. Снятие ограничения строки
   * не порождает (37.31).
   */
  oversightType: NotificationType | null;
  /** Письмо владельцу в ящик лица — без имени администратора (решение заказчика). */
  ownerNoticeType: NotificationType;
  /** Условие по данным до записи — или `null`. */
  precondition: ModerationPrecondition | null;
  /** Что записать. Ключ с `undefined` — обнулить (см. шапку). */
  patch: (context: ModerationPatchContext) => ModerationPatch;
};

/**
 * Словарь действий. `Record<ModerationAction, …>` — новое действие без строки
 * здесь не соберётся.
 */
export const MODERATION_ACTION_SPECS: Record<ModerationAction, ModerationActionSpec> = {
  hide: {
    logAction: 'moderation_hide',
    requiresReason: 'Причина скрытия обязательна',
    // Скрытие публикации уходит в общую очередь (37.31): двое администраторов,
    // не зная о решениях друг друга, способны отменять их по очереди.
    oversightType: 'oversight_publication_hidden',
    ownerNoticeType: 'publication_hidden_for_owner',
    precondition: 'no_live_bookings',
    patch: ({ reason, actorId, now }) => ({
      status: 'hidden',
      hideReason: reason,
      hiddenByUserId: actorId,
      hiddenAt: now.toISOString(),
      // Вид скрытия — признак, а не вывод из текста причины (36.12).
      hiddenKind: 'moderation',
      // Скрытие начинает разбирательство заново: прежний признак «исправлено,
      // ждёт проверки» к новой причине отношения не имеет.
      awaitingRecheck: false,
    }),
  },
  unhide: {
    logAction: 'moderation_unhide',
    requiresReason: false,
    // Возврат — снятие ограничения, очередь надзора строки не получает.
    oversightType: null,
    // Владельца возврат уведомляет ТОЖЕ: иначе исправивший нарушение продолжит ждать.
    ownerNoticeType: 'publication_unhidden_for_owner',
    precondition: null,
    patch: () => ({
      status: 'published',
      // Все поля скрытия гасятся, включая вид и признак повторной проверки:
      // забытый признак оставил бы живую публикацию в разделе модерации навсегда,
      // забытый вид — показал бы плашку на возвращённой карточке.
      hideReason: undefined,
      hiddenByUserId: undefined,
      hiddenAt: undefined,
      hiddenKind: undefined,
      awaitingRecheck: false,
    }),
  },
};

/** Перечень через запятую с «или» перед последним: «a, b или c». */
function listWithOr(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} или ${items.at(-1)}`;
}

/**
 * Тексты отказов, общие для всех действий. Перечень действий в тексте собирается
 * из словаря: добавление действия меняет текст само.
 */
export const MODERATION_ERRORS = {
  unknownAction: `Некорректное действие. Ожидается ${listWithOr(MODERATION_ACTIONS)}`,
  unknownEntityType: 'Некорректный тип сущности',
  invalidEntityId: 'Некорректный entityId',
} as const;
