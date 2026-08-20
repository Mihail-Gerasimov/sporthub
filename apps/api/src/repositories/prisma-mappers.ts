// Мапперы границы: превращение значений базы в те же значения, что отдавало файловое
// хранилище, и обратно.
//
// Это один модуль намеренно. Каждое из преобразований ниже — место, где поведение
// съезжает молча: ответ остаётся с кодом 200, форма похожа, а значение уже другое.
// Разложенные по репозиториям, они разъедутся при первой же правке.
//
// Что именно ловится:
//
// - **Дата и время.** В базе день занятия хранится типом даты, а время — типом времени;
//   контракт же описывает строки `YYYY-MM-DD` и `HH:MM`. Драйвер отдаёт и то и другое
//   объектом даты: день — полуночью по UTC, время — тем же временем 1 января 1970 года.
// - **Отсутствие ключа против пустого значения.** Файл не хранил ключ вовсе, база
//   хранит пустое значение. В ответе это разница между «поля нет» и «поле есть и пустое»,
//   и её видит сверка контрактов.
// - **Стирание поля правкой.** В файловом хранилище правка с пустым значением СТИРАЛА
//   поле — на этом держится снятие причины скрытия. В базе такое значение игнорируется,
//   то есть поле осталось бы прежним, и снять причину стало бы нечем.
// - **Коллекции, ставшие таблицами.** Массив ссылок раньше переписывался целиком.
//   В базе это строки связующей таблицы, и переписывание целиком стирало бы их и
//   заводило заново — с новыми номерами и лишней работой. Нужен разбор на «добавить»
//   и «убрать».

/** День занятия: тип даты в базе → строка `YYYY-MM-DD`. */
export function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Строка `YYYY-MM-DD` → значение для колонки типа даты (полночь по UTC). */
export function fromDateKey(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Не удалось разобрать дату: ${value}`);
  }

  return parsed;
}

/** Время занятия: тип времени в базе → строка `HH:MM`. */
export function toTimeKey(value: Date): string {
  return value.toISOString().slice(11, 16);
}

/** Строка `HH:MM` → значение для колонки типа времени. */
export function fromTimeKey(value: string): Date {
  const parsed = new Date(`1970-01-01T${value}:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Не удалось разобрать время: ${value}`);
  }

  return parsed;
}

/** Метка времени: в контракте это строка, а не объект даты. */
export function toIsoString(value: Date): string {
  return value.toISOString();
}

/** Необязательная метка времени. Пустое значение означает отсутствие ключа. */
export function toOptionalIsoString(value: Date | null): string | undefined {
  return value === null ? undefined : value.toISOString();
}

/**
 * Пустое значение → отсутствие ключа.
 *
 * Разница не косметическая: сверка контрактов сравнивает тела целиком, и ключ
 * со значением `null` там, где раньше ключа не было, — это расхождение.
 */
export function omitNulls<TValue extends Record<string, unknown>>(value: TValue): TValue {
  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue;

    result[key] = item;
  }

  return result as TValue;
}

/**
 * Пустая коллекция → отсутствие ключа.
 *
 * Отдельно от предыдущего: массив ссылок, ставший таблицей, при отсутствии строк
 * даёт пустой массив, а файл в этом случае ключа не хранил вовсе.
 */
export function omitEmptyArrays<TValue extends Record<string, unknown>>(value: TValue): TValue {
  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item) && item.length === 0) continue;

    result[key] = item;
  }

  return result as TValue;
}

/**
 * Значение для правки: отсутствие значения означает «стереть».
 *
 * Файловое хранилище затирало поле, когда в правке стояло пустое значение.
 * База такое значение игнорирует, поэтому оно переводится в явное «пусто».
 * Ключи, которых в правке нет вовсе, сюда не попадают — их и не трогаем.
 */
export function toNullable<TValue>(value: TValue | undefined): TValue | null {
  return value === undefined ? null : value;
}

/**
 * Строка метки времени → значение колонки.
 *
 * Отсутствие метки в контракте выражается отсутствием ключа, в базе — пустым
 * значением. Обратный перевод делает `toOptionalIsoString`.
 *
 * ⚠️ Неразборчивое значение не превращается молча в «нет метки»: так в базу уехала бы
 * пустота вместо даты, и потеря обнаружилась бы через месяц, когда исходник уже стёрт.
 */
export function fromOptionalIsoString(value: string | undefined | null): Date | null {
  if (value === undefined || value === null || value === '') return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Не удалось разобрать метку времени: ${value}`);
  }

  return parsed;
}

/** Что добавить и что убрать, чтобы связующая таблица совпала с новым набором. */
export type IdSetDiff = { added: number[]; removed: number[] };

/**
 * Разбор набора ссылок на добавленное и убранное.
 *
 * Переписывание целиком выглядит проще, но стирает строки и заводит их заново:
 * лишняя работа при каждом сохранении и потеря всего, что к этим строкам
 * когда-нибудь прицепится.
 */
export function diffIdSets(previous: readonly number[], next: readonly number[]): IdSetDiff {
  const before = new Set(previous);
  const after = new Set(next);

  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
  };
}
