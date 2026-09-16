// Точка входа пакета @sporthub/domain.
// Чистая доменная логика без ввода-вывода: она не знает ни про файловую систему,
// ни про HTTP, ни про SQL. Поэтому её одинаково используют и фронт (apps/web),
// и бэкенд (apps/api) — одно правило не имеет права разойтись между ними.
export * from './account-kind';
export * from './brand';
export * from './booking-status';
export * from './booking-owner';
export * from './booking-fsm';
export * from './discipline-config';
export * from './athlete-streaks';
export * from './athlete-timeline-format';
export * from './notification-types';
export * from './notification-addressee';
export * from './permissions';
export * from './sorting';
export * from './text-normalization';
export * from './trainer-sports';
export * from './schemas/publish';
export * from './time';
export * from './hide-kind';
export * from './link-status';
export * from './moderation-actions';
export * from './session-policy';
// ⚠️ Реэкспорт для тех, кому общий вход и так нужен (бэкенд). У прокси фронта
// вход СВОЙ — `@sporthub/domain/session-cookie`: общий тянет `zod` схемами
// публикации, а прокси выполняется на каждом обращении к закрытым разделам.
export * from './session-cookie';
export * from './password-reset-policy';
