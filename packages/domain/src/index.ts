// Точка входа пакета @sporthub/domain.
// Чистая доменная логика без ввода-вывода: она не знает ни про файловую систему,
// ни про HTTP, ни про SQL. Поэтому её одинаково используют и фронт (apps/web),
// и бэкенд (apps/api) — расчёт надёжности не имеет права разойтись между ними.
export * from './booking-status';
export * from './discipline-config';
export * from './athlete-streaks';
export * from './athlete-timeline-format';
export * from './notification-types';
export * from './reliability';
export * from './schemas/publish';
