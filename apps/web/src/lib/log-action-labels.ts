// Подписи и тона действий журнала — словарь для раздела «Журнал» служебной панели.
//
// Шаг 38.44: вынесено из `components/admin/LogsPage.tsx`. Словарь растёт с каждым
// новым действием (`LOG_ACTIONS` в `@sporthub/types`) — тип `Record<LogAction, …>`
// требует подписи и тона у каждого, и компилятор показывает, где забыли. Место
// растущего словаря — `lib/`, рядом с текстами уведомлений, а не внутри компонента:
// компонент от этого только толстел, а читать словарь могут и другие экраны.
//
// Три словаря, и у каждого свой смысл: `ACTION_LABELS` — живые действия, `ACTION_TONES` —
// их тон в значке, `LEGACY_ACTION_LABELS` — словарь ПРОШЛОГО для строк журнала,
// чьи действия из `LOG_ACTIONS` ушли (подробно — у самого словаря).
import type { LogAction } from '@sporthub/types';

// Маппинг LogAction → human-readable русские метки.
export const ACTION_LABELS: Record<LogAction, string> = {
  publish_create: 'Публикация создана',
  publish_update: 'Публикация обновлена',
  publish_delete: 'Публикация удалена',
  publish_archive: 'Публикация убрана из каталога',
  booking_create: 'Запись создана',
  booking_cancel: 'Запись отменена',
  admin_impersonate_start: 'Impersonation начат',
  admin_impersonate_stop: 'Impersonation завершён',
  moderation_hide: 'Публикация скрыта',
  moderation_unhide: 'Публикация восстановлена',
  // Phase 24 — FSM booking
  booking_confirm: 'Запись подтверждена',
  booking_reject: 'Запись отклонена',
  booking_check_in_completed: 'Check-in: тренировка проведена',
  booking_check_in_no_show: 'Check-in: спортсмен не пришёл',
  booking_auto_expire: 'Запись авто-отменена (истёк срок)',
  // Phase 24 — trainer↔club link
  link_request: 'Запрос привязки тренер↔клуб',
  link_approve: 'Привязка подтверждена',
  link_reject: 'Привязка отклонена',
  link_revoke: 'Привязка разорвана',
  // Phase 24 — админский hard-delete
  admin_hard_delete_booking: 'Запись удалена администратором',
  // Phase 29 Step 29.7 — админский сброс пароля
  admin_password_change: 'Пароль изменён администратором',
  // Phase 37 Step 37.27 — сработала ступень блокировки после подбора пароля
  login_lockout: 'Вход заблокирован после неудачных попыток',
  // Phase 38 Step 38.44 — верификация публикаций
  verification_grant: 'Публикация подтверждена',
  verification_revoke: 'Подтверждение отозвано',
};

/**
 * Подписи действий, которых больше нет (Phase 37 Step 37.29).
 *
 * ⚠️ Это не второй словарь на замену первому, а СЛОВАРЬ ПРОШЛОГО — по образцу
 * `LEGACY_ROLE_LABELS` из `packages/domain/src/account-kind.ts`. `admin_login`
 * и `moderation_auto_restore` удалены из `LOG_ACTIONS`: писателя у них не было
 * ни одного, и в выпадающем фильтре они обещали событие, которого система
 * не производит. Но записанные СТРОКИ журнала остались — на живой базе это две
 * строки `admin_login` от 21.08.2026, — и удалять их нельзя: журнал тем и ценен,
 * что прошлое в нём не переписывают. Показывать вместо подписи сырое
 * `admin_login` значило бы наказать администратора за нашу уборку словаря.
 *
 * Список пополняется только тогда, когда действие УХОДИТ из `LOG_ACTIONS`
 * с живыми строками в журнале (как `reliability_recompute` в 38.26); живые действия
 * пополняют `ACTION_LABELS` выше. Одно значение не бывает в обоих словарях —
 * стережёт `log-action-labels.test.ts`.
 */
export const LEGACY_ACTION_LABELS: Record<string, string> = {
  admin_login: 'Вход администратора',
  moderation_auto_restore: 'Публикация авто-восстановлена',
  // Phase 38 Step 38.26: маршрут пересчёта надёжности снят вместе с самой
  // надёжностью (38.23). Строки журнала живы — на живой базе это записи прогонов
  // и ручных проверок, — и подпись им положена, как и прежним двум.
  reliability_recompute: 'Рейтинг пересчитан',
};

// Тон badge для типа действия — Phase 28.18 семантические уровни:
// good (lime-soft) | warn (gold-soft) | danger (red-soft) | neutral (line-outline)
export type ActionTone = 'good' | 'warn' | 'danger' | 'neutral';

// Тип Record<LogAction, ...> обязателен: он не даёт словарю разойтись
// с общим списком действий — забытый ключ ловит компилятор.
export const ACTION_TONES: Record<LogAction, ActionTone> = {
  publish_create: 'good',
  publish_update: 'neutral',
  publish_delete: 'danger',
  publish_archive: 'warn',
  booking_create: 'good',
  booking_confirm: 'good',
  booking_reject: 'danger',
  booking_cancel: 'warn',
  booking_check_in_completed: 'good',
  booking_check_in_no_show: 'warn',
  booking_auto_expire: 'warn',
  link_request: 'neutral',
  link_approve: 'good',
  link_reject: 'danger',
  link_revoke: 'danger',
  admin_hard_delete_booking: 'danger',
  admin_impersonate_start: 'warn',
  admin_impersonate_stop: 'neutral',
  moderation_hide: 'warn',
  moderation_unhide: 'good',
  // Админский сброс пароля — тон как у прочих админских вмешательств
  admin_password_change: 'warn',
  // Блокировка входа — единственное в журнале событие про попытку взлома,
  // и тон у неё соответствующий: это не предупреждение, а происшествие.
  login_lockout: 'danger',
  verification_grant: 'good',
  verification_revoke: 'warn',
};
