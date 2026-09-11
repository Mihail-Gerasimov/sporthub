// Форматтер даты уведомления: один модуль, две названные формы.
//
// ⚠️ Почему набор появляется только сейчас. Форм было две, объявленных в двух
// файлах: `formatFullDate` в ленте кабинета и `formatNotificationDate`
// в колокольчике. Обе форматировали одно и то же — момент уведомления, — и обе
// проверялись только косвенно, через отрисовку карточки. Такая проверка молчит
// о самом важном: сколько форматтеров в дереве. Шаг 37.40 сводит их в один
// модуль, и здесь проверяется, что при этом не изменилась НИ ОДНА из форм.

import { describe, expect, it } from 'vitest';

import { formatNotificationDateFull, formatNotificationDateShort } from '@/lib/notification-date';

/** Момент в середине суток и в середине года — вне досягаемости любого пояса. */
const THIS_YEAR = '2026-04-22T12:00:00.000Z';
const LAST_YEAR = '2025-06-15T12:00:00.000Z';

describe('формат даты уведомления', () => {
  it('полная форма — ровно то, что рисовала лента кабинета до выноса', () => {
    // ⚠️ Закрепление прежнего вывода, а не описание желаемого. Шаг 37.40 —
    // рефакторинг: обе поверхности обязаны выглядеть так же, как выглядели.
    const legacy = new Date(THIS_YEAR).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    expect(formatNotificationDateFull(THIS_YEAR)).toBe(legacy);
  });

  it('краткая форма — ровно то, что рисовала выпадашка колокольчика до выноса', () => {
    const legacy = new Date(THIS_YEAR).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    expect(formatNotificationDateShort(THIS_YEAR)).toBe(legacy);
  });

  it('формы разные, и это осознанно: год есть только в полной', () => {
    // ⚠️ Ради этого различения формы и остались двумя функциями, а не одной
    // с флагом. В ленте есть ведро «Раньше», и прошлогодняя строка без года
    // читается как сегодняшняя. В выпадашке шириной 320px лежат пять последних
    // строк — год там шум.
    expect(formatNotificationDateFull(LAST_YEAR)).toContain('2025');
    expect(formatNotificationDateFull(THIS_YEAR)).toContain('2026');

    expect(formatNotificationDateShort(LAST_YEAR)).not.toContain('2025');
    expect(formatNotificationDateShort(THIS_YEAR)).not.toContain('2026');
  });

  it('обе формы называют время — уведомление без часа бесполезно', () => {
    // Сегодняшняя строка отличается от вчерашней только временем: без него
    // карточки одного дня становятся неразличимы.
    expect(formatNotificationDateFull(THIS_YEAR)).toMatch(/\d{2}:\d{2}/);
    expect(formatNotificationDateShort(THIS_YEAR)).toMatch(/\d{2}:\d{2}/);
  });

  it('соседние сутки различимы в обеих формах', () => {
    // Граница суток — единственное место, где ошибка форматтера видна человеку
    // как «не та дата», а не как «странная строка».
    const evening = '2026-04-21T20:00:00.000Z';
    const morning = '2026-04-22T08:00:00.000Z';

    expect(formatNotificationDateFull(evening)).not.toBe(formatNotificationDateFull(morning));
    expect(formatNotificationDateShort(evening)).not.toBe(formatNotificationDateShort(morning));
  });

  it('негодная строка возвращается как есть — карточка не падает', () => {
    // ⚠️ Здесь поведение ИСПРАВЛЕНО, а не сохранено, и это единственное отличие
    // от прежних копий. Обе они заявляли такой возврат через `try/catch`, и обе
    // ветки были НЕДОСТИЖИМЫ: `toLocaleString` на непарсящейся дате ничего
    // не бросает — он возвращает английскую строку «Invalid Date», и она уезжала
    // человеку на экран. Уведомление — побочный эффект чужого действия, и кривой
    // `createdAt` не вправе ни уронить список, ни показать служебную строку.
    expect(formatNotificationDateFull('не дата')).toBe('не дата');
    expect(formatNotificationDateShort('не дата')).toBe('не дата');
    expect(formatNotificationDateFull('')).toBe('');
  });
});
