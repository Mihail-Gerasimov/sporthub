/**
 * Момент уведомления в человеческом виде. Одно объявление на все поверхности,
 * где показываются уведомления.
 *
 * ⚠️ Было два форматтера в двух файлах: `formatFullDate` в ленте кабинета
 * и `formatNotificationDate` в выпадашке колокольчика. Они форматировали одну
 * и ту же величину и расходились не в том, ЧТО показывают, а в том, где
 * объявлены: третья поверхность — надзорная лента администратора — завела бы
 * третий. Здесь их одна реализация.
 *
 * ⚠️ Почему две НАЗВАННЫЕ функции, а не одна с флагом. Формы различаются
 * осознанно: в ленте есть ведро «Раньше», и прошлогодняя строка без года
 * читается как сегодняшняя; в выпадашке шириной 320px лежат пять последних
 * строк, и год там шум. Вызов `format(iso, true)` о таком различении молчит,
 * а перепутанный флаг тип не ловит. Имя функции — ловит.
 *
 * ⚠️ Форматтер журнала (`formatLogDate` в `components/admin/LogsPage.tsx`) сюда
 * НЕ сводится: он про другую величину — момент служебной записи — и живёт
 * в разделе с другой плотностью строки. Свести его значило бы связать два
 * раздела одним словарём ради совпадения слова «дата».
 */

/** Лента: полная дата с годом. */
const FULL_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/** Выпадашка: день, месяц и время — без года. */
const SHORT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

const LOCALE = 'ru-RU';

/**
 * Общая реализация обеих форм.
 *
 * ⚠️ Негодная строка возвращается как есть. Прежние копии заявляли это
 * через `try/catch`, и ветка была НЕДОСТИЖИМА: `toLocaleString` на непарсящейся
 * дате ничего не бросает — он возвращает строку «Invalid Date», и она уезжала
 * на экран. Проверка теперь явная, по значению времени.
 *
 * Уведомление — побочный эффект чужого действия, и кривой `createdAt` не вправе
 * ни уронить список, ни показать человеку английскую служебную строку.
 */
function formatMoment(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return iso;

  try {
    return date.toLocaleString(LOCALE, options);
  } catch {
    // Сломанные данные локали (сборка без ICU) — показываем исходную строку.
    return iso;
  }
}

/** Полная дата с годом — для карточки в ленте уведомлений. */
export function formatNotificationDateFull(iso: string): string {
  return formatMoment(iso, FULL_OPTIONS);
}

/** Краткая дата без года — для выпадашки колокольчика. */
export function formatNotificationDateShort(iso: string): string {
  return formatMoment(iso, SHORT_OPTIONS);
}
