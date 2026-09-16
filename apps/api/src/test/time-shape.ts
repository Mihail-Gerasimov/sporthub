// Вид записи метки времени — сторож формата для сверки контрактов.
//
// Сверка сравнивает ответы с эталоном, заменяя значения меток времени заглушкой:
// иначе тест краснел бы на каждом прогоне, потому что значения зависят от момента вызова.
// Побочный эффект — вместе со значением пропадал и вид записи, а он при переезде
// хранилища меняется первым: файл отдаёт строку, база отдаёт объект даты, и после
// сериализации разница видна только в формате.
//
// Здесь вид записи вычисляется отдельно от значения: цифры заменяются девятками,
// разделители остаются. Значение по-прежнему не сравнивается, формат — сравнивается.

/** Ключи, значение которых зависит от момента вызова. Их значения сверка не сравнивает. */
export const VOLATILE_KEYS: ReadonlySet<string> = new Set([
  'createdAt',
  'updatedAt',
  'at',
  'readAt',
  'approvedAt',
  'rejectedAt',
  'revokedAt',
  'hiddenAt',
  // Проверка площадкой (38.55): «когда подтверждено» — метка времени, как и скрытие.
  'verifiedAt',
  'completedAt',
  'timestamp',
  'uptime',
]);

/** Вид, в котором метки времени записаны сегодня: ISO 8601 с миллисекундами и зоной. */
export const ISO_TIME_SHAPE = '9999-99-99T99:99:99.999Z';

/**
 * Вид записи одного значения. Строка превращается в маску цифр, всё остальное
 * называется по типу: подмена строки на число или на объект — тоже смена формата.
 */
export function timeShape(value: unknown): string {
  if (typeof value === 'string') return value.replace(/[0-9]/g, '9');
  if (typeof value === 'number') return '<число>';
  if (typeof value === 'boolean') return '<логическое>';
  if (value === null) return '<пусто>';

  return '<объект>';
}

/** Путь до метки в теле ответа и вид её записи. */
export type TimeShapeEntry = { path: string; shape: string };

/**
 * Все метки времени в теле ответа с путём до каждой.
 *
 * Внутрь самого значения метки не заходим: если там оказался объект, это уже
 * расхождение формата, а не контейнер с полями.
 */
export function collectTimeShapes(body: unknown): TimeShapeEntry[] {
  const found: TimeShapeEntry[] = [];

  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));

      return;
    }

    if (value === null || typeof value !== 'object') return;

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const nested = path === '' ? key : `${path}.${key}`;

      if (VOLATILE_KEYS.has(key)) {
        // Отсутствующая метка — это не смена формата, её проверяет сама сверка тела.
        if (item !== undefined) found.push({ path: nested, shape: timeShape(item) });

        continue;
      }

      walk(item, nested);
    }
  };

  walk(body, '');

  return found;
}
