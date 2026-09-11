/**
 * Вёдра по дате для ленты уведомлений: «Сегодня», «Вчера», «Эта неделя», «Раньше».
 *
 * ⚠️ Почему правило живёт в `lib`, а не рядом с лентой кабинета. Надзорная лента
 * администратора (фаза 37) группирует строки теми же вёдрами, а живёт в служебной
 * панели — не в кабинете. Пока правило лежало внутри `NotificationsListPage`,
 * у второй ленты было ровно два пути: тянуть код из чужого каркаса или завести
 * вторую копию. Копии в этом домене расходились трижды за две фазы, поэтому общее
 * вынесено ДО появления второго потребителя, а не после первого расхождения.
 *
 * Здесь только чистые функции и словари: ни состояния, ни запросов, ни разметки —
 * модуль одинаково годится и серверному компоненту, и клиентскому.
 */

/** Ведро, в которое попадает строка ленты. */
export type DateBucket = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

/** Порядок вёдер в ленте: от свежего к старому. */
export const BUCKET_ORDER: readonly DateBucket[] = ['today', 'yesterday', 'thisWeek', 'earlier'];

/** Подписи заголовков вёдер. Одно объявление на все ленты. */
export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  thisWeek: 'Эта неделя',
  earlier: 'Раньше',
};

/**
 * Определяет ведро для `createdAt` относительно `now`.
 *
 * Считает в UTC — ради детерминизма в тестах и на сервере, независимо от пояса
 * хоста. Понедельник считается началом недели: это соглашение проекта, и именно
 * оно отделяет «эту неделю» от «раньше».
 */
export function getDateBucket(iso: string, now: Date): DateBucket {
  const ts = new Date(iso).getTime();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const yesterdayStart = todayStart - msPerDay;

  // Понедельник = начало недели. getUTCDay(): 0=Вс..6=Сб → daysToMonday.
  const nowDay = now.getUTCDay();
  const daysToMonday = nowDay === 0 ? 6 : nowDay - 1;
  const weekStart = todayStart - daysToMonday * msPerDay;

  if (ts >= todayStart) return 'today';
  if (ts >= yesterdayStart) return 'yesterday';
  if (ts >= weekStart) return 'thisWeek';
  return 'earlier';
}
