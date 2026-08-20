// Нарушение уникальности: узнать его и понять, КАКОЕ именно.
//
// База отвечает на все нарушения уникальности одним кодом. Наружу же должны уходить
// три разных русских текста — «Email уже зарегистрирован», «Пользователь уже записан
// на это занятие», «Для этой пары уже существует активная связь», — и различить их
// можно только по тому, какое ограничение сработало.
//
// Поэтому перевод живёт в реализациях репозиториев, а не в общем фильтре ошибок:
// общий фильтр знает код, но не знает контекста операции, и выдал бы один текст
// на все три случая. Здесь — только распознавание; текст подставляет тот, кто знает,
// что он делал.

/** Код Prisma для нарушения уникального ограничения. */
const UNIQUE_VIOLATION = 'P2002';

type ConstraintDetails = { fields?: unknown; index?: unknown };

type PrismaLikeError = {
  code?: unknown;
  meta?: {
    /** Классический движок кладёт список колонок сюда. */
    target?: unknown;
    modelName?: unknown;
    /** Драйвер-адаптер кладёт подробности глубже — вместе с исходным кодом СУБД. */
    driverAdapterError?: { cause?: { constraint?: ConstraintDetails } } | null;
  } | null;
};

/** Что именно нарушено: список колонок или имя индекса, смотря кто отвечает. */
function describeConstraint(meta: PrismaLikeError['meta']): string {
  const parts: unknown[] = [];

  if (meta?.target !== undefined) parts.push(meta.target);

  const constraint = meta?.driverAdapterError?.cause?.constraint;

  if (constraint?.fields !== undefined) parts.push(constraint.fields);
  if (constraint?.index !== undefined) parts.push(constraint.index);

  return parts.map((part) => (Array.isArray(part) ? part.join(',') : String(part))).join(',');
}

/**
 * Это нарушение уникальности? И если указано имя ограничения — именно оно?
 *
 * Имя проверяется вхождением: база кладёт в описание либо имя индекса, либо список
 * колонок, и форма отличается у разных ограничений.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const { code, meta } = error as PrismaLikeError;

  if (code !== UNIQUE_VIOLATION) return false;
  if (constraint === undefined) return true;

  return describeConstraint(meta).includes(constraint);
}
