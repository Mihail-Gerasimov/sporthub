// Формы успешного ответа.
//
// Общее правило проекта — `{ success: true, data }`. Но три формы отличаются,
// и все три завязаны на существующий фронт, поэтому сохраняются как есть:
//   1. часть операций отдаёт `{ success: true }` вообще без `data`;
//   2. логи и публикации кладут счётчики РЯДОМ с `data`, а не внутрь;
//   3. уведомления кладут счётчики ВНУТРЬ `data`.
// Контроллер выражает нужную форму типом возвращаемого значения, а интерцептор
// её собирает — вместо 273 ручных сборок ответа, как было раньше.

/** Успех без полезной нагрузки: `{ success: true }`. */
export const EMPTY_RESULT = Symbol("EMPTY_RESULT");
export type EmptyResult = typeof EMPTY_RESULT;

/**
 * Ответ, у которого часть полей лежит на верхнем уровне рядом с `data`.
 * Так устроены выдача логов и список публикаций: `{ success, data, total, offset, limit }`.
 */
export class TopLevelResult<TData> {
  constructor(
    readonly data: TData,
    readonly extra: Record<string, unknown>,
  ) {}
}

/** Хелпер для читаемости в контроллерах. */
export function withTopLevel<TData>(
  data: TData,
  extra: Record<string, unknown>,
): TopLevelResult<TData> {
  return new TopLevelResult(data, extra);
}
