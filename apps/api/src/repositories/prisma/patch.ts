// Приведение частичной правки к данным запроса Prisma.
//
// Три вещи, из-за которых это отдельный модуль, а не по три строки в каждом репозитории:
//
// 1. **Отсутствие ключа и `undefined` — разные вещи.** Файловое хранилище собирало
//    новую запись как `{ ...прежняя, ...правка }`: ключ со значением `undefined`
//    СТИРАЛ поле (на этом держится снятие причины скрытия и отвязка услуги от
//    разорванной связи), а ключа не было вовсе — поле оставалось прежним. Prisma
//    и то и другое считает «не трогать». Значит, решать надо по НАЛИЧИЮ ключа,
//    а `undefined` переводить в явное `null` — этим занят `toNullable`.
// 2. **Список полей — один на вставку и правку.** Разъехавшись, они дают правку,
//    которая молча не сохраняет одно поле из двадцати.
// 3. **Наборы ссылок разбираются, а не переписываются.** Полная перезапись строк
//    связующей таблицы стирает их и заводит заново — с новыми номерами и лишней
//    работой при каждом сохранении.

import type { EntityId } from '@sporthub/types';

import { diffIdSets, toNullable } from '../prisma-mappers';

/** Есть ли ключ в правке. Именно наличие: значение `undefined` означает «стереть». */
export function hasKey<TValue extends object>(patch: TValue, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

/**
 * Набор ссылок из данных, у которых ключа может не быть вовсе.
 *
 * Тип объявляет эти массивы обязательными, но в файловом хранилище лежат записи
 * без них, и приведение обязано пережить перенос.
 */
export function idsOf(value: readonly EntityId[] | undefined): EntityId[] {
  return Array.isArray(value) ? [...value] : [];
}

/**
 * Поля колонок NOT NULL: переносятся как есть, только если ключ в правке присутствует.
 *
 * Стереть такое поле нельзя — база не даст, — поэтому `undefined` здесь означает
 * ровно то же, что и отсутствие ключа: «не трогать».
 */
export function copyPresent<TSource extends object>(
  patch: TSource,
  fields: readonly (keyof TSource & string)[],
  data: Record<string, unknown>,
): void {
  for (const field of fields) {
    if (!hasKey(patch, field) || patch[field] === undefined) continue;

    data[field] = patch[field];
  }
}

/** Поля колонок, допускающих пусто: ключ со значением `undefined` стирает поле. */
export function copyErasable<TSource extends object>(
  patch: TSource,
  fields: readonly (keyof TSource & string)[],
  data: Record<string, unknown>,
): void {
  for (const field of fields) {
    if (!hasKey(patch, field)) continue;

    data[field] = toNullable(patch[field]);
  }
}

/**
 * Согласование связующей таблицы с новым набором ссылок.
 *
 * Порядок важен: сначала убираем, потом добавляем. Первичный ключ у этих таблиц
 * составной, и при обратном порядке пересечение старого и нового набора дало бы
 * нарушение уникальности на строке, которую мы и так собирались оставить.
 */
export async function syncIdLinks(options: {
  previous: readonly EntityId[];
  next: readonly EntityId[];
  remove: (ids: EntityId[]) => Promise<unknown>;
  add: (ids: EntityId[]) => Promise<unknown>;
}): Promise<void> {
  const { added, removed } = diffIdSets(options.previous, options.next);

  if (removed.length > 0) await options.remove(removed);
  if (added.length > 0) await options.add(added);
}
