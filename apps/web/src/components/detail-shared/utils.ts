/* Хелперы для detail-страниц клуба и тренера (Phase 28.22).
 *
 * `getCurrentWeekRange` — границы текущей ISO-недели (Пн 00:00 .. Вс 23:59)
 * в формате `YYYY-MM-DD`. Используется страницами для фильтрации слотов
 * расписания: только текущая неделя, без навигации между неделями.
 * Сравнение строк-дат через лексикографический localeCompare безопасно
 * (формат `YYYY-MM-DD` упорядочен лексикографически = хронологически).
 */

/* День ISO-недели: Пн=0, Вт=1, ..., Вс=6. */
function getDayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/* Дата → строка `YYYY-MM-DD` в локальной TZ. */
function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentWeekRange(): { mondayIso: string; sundayIso: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayIdx = getDayIndex(today);
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayIdx);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    mondayIso: formatIsoDate(monday),
    sundayIso: formatIsoDate(sunday),
  };
}
