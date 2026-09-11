// Вид адресата уведомления (шаг 37.4, фаза 37).
//
// До этой фазы вид адресата НЕ был записан нигде — он выводился из пустоты колонок:
// «обе колонки лица пусты, значит строка личная» (`prisma/catalog.repository.ts`).
// Пока видов было три, вывод работал. Надзорному ящику фазы 37 колонок лица тоже
// не полагается — и он становится НЕОТЛИЧИМ от личного: строка уезжает в чужой
// личный ящик, ответ 200, тест по API зелёный.
//
// ⚠️ Почему не булев признак `addressee_supervision`. Он добавил бы к выводу второе
// условие, а пятый вид адресата потребовал бы второго булева и третьего условия —
// то есть «добавить вид = правка семи мест», ровно то, что запрещает главное правило.
// Здесь вид НАЗВАН, а не угадан.
//
// ⚠️ Почему карта формы, а не выражение CHECK, выписанное руками в скрипте ограничений.
// Обещание «новый вид адресата = правка одного словаря» не выполнилось бы: понадобилась
// бы ещё правка `scripts/db-constraints.mjs` и миграции. Скрипт СОБИРАЕТ выражение
// из карты ниже (шаг 37.8) — пятый вид меняет SQL сам. Образец того же приёма уже
// есть: `users_account_kind` собирается из `ACCOUNT_KINDS`.

import type { NotificationAddresseeKindValue } from '@sporthub/types';

/**
 * Все виды адресата — единственный СПИСОК на весь проект.
 *
 * ⚠️ Тип живёт в `@sporthub/types`, список — здесь, и это не дубль, а разделение
 * обязанностей: пакет типов ни от чего не зависит по построению, поэтому значения
 * там объявлены объединением. Полноту списка держит `satisfies`: забыть значение
 * нельзя — не соберётся.
 *
 * Порядок значим только для читаемости SQL: сначала три существовавших вида,
 * потом новый.
 */
export const NOTIFICATION_ADDRESSEE_KINDS = [
  'personal',
  'club',
  'trainer',
  'supervision',
] as const satisfies readonly NotificationAddresseeKindValue[];

export type NotificationAddresseeKind = (typeof NOTIFICATION_ADDRESSEE_KINDS)[number];

/** Человеческие подписи — для служебной панели и разбора инцидентов. */
export const NOTIFICATION_ADDRESSEE_LABELS: Record<NotificationAddresseeKind, string> = {
  personal: 'Личный ящик',
  club: 'Ящик клуба',
  trainer: 'Ящик карточки тренера',
  supervision: 'Очередь надзора',
};

/**
 * Какая ссылка у строки заполнена, а какая пуста — по одному случаю на вид адресата.
 *
 * Это не «описание для документации», а ИСТОЧНИК ограничения целостности: скрипт
 * `scripts/db-constraints.mjs` раскладывает карту в дизъюнкцию, а `schema.test.ts`
 * сверяет получившееся выражение с живой базой.
 *
 * ⚠️ `supervision` — единственный вид без владельца-человека, и это названная цена
 * решения 5.2. У очереди надзора человека нет: подставить какого-то означало бы
 * потерять строку вместе с его учётной записью (на `user_id` висит каскад).
 */
export const NOTIFICATION_ADDRESSEE_SHAPE = {
  personal: { user: true, club: false, trainer: false },
  club: { user: true, club: true, trainer: false },
  trainer: { user: true, club: false, trainer: true },
  supervision: { user: false, club: false, trainer: false },
} as const satisfies Record<
  NotificationAddresseeKind,
  { user: boolean; club: boolean; trainer: boolean }
>;

/**
 * Известен ли такой вид. Нужен разбору того, что пришло из базы или из запроса.
 *
 * ⚠️ Отдельная проверка, а не сравнение с литералом по месту: опечатка в одну букву
 * (`'persona1'`) уехала бы в предикат частичного индекса и прошла бы молча — сверка
 * литералов предиката со словарём как раз на этой функции и стоит (шаг 37.13).
 */
export function isNotificationAddresseeKind(value: unknown): value is NotificationAddresseeKind {
  return (
    typeof value === 'string' && (NOTIFICATION_ADDRESSEE_KINDS as readonly string[]).includes(value)
  );
}

/** Полагается ли строке этого вида владелец-человек. */
export function addresseeKindHasOwner(kind: NotificationAddresseeKind): boolean {
  return NOTIFICATION_ADDRESSEE_SHAPE[kind].user;
}
