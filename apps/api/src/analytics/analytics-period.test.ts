// Границы периодов аналитики.
//
// Прежняя формула смешивала три пояса в пяти строках, и «неделя» у пояса восточнее UTC
// начиналась не с того дня. Проверяется именно граница, а не сам подсчёт.

import { describe, expect, it } from 'vitest';

import { getFromDateForTests } from './analytics.controller';

describe('Начало периода аналитики', () => {
  // 22:00 UTC — это уже следующий день по самарским часам.
  const lateEvening = new Date('2026-08-20T22:00:00.000Z');

  it('«сегодня» берётся по часам проекта, а не по поясу процесса', () => {
    expect(getFromDateForTests('today', lateEvening)).toBe('2026-08-21');
  });

  it('«неделя» отсчитывается от того же дня', () => {
    expect(getFromDateForTests('week', lateEvening)).toBe('2026-08-14');
  });

  it('«месяц» даёт тот же день предыдущего месяца', () => {
    expect(getFromDateForTests('month', lateEvening)).toBe('2026-07-21');
  });

  it('месяц назад от 31 марта — конец февраля, а не начало марта', () => {
    expect(getFromDateForTests('month', new Date('2026-03-31T06:00:00.000Z'))).toBe('2026-02-28');
    expect(getFromDateForTests('month', new Date('2024-03-31T06:00:00.000Z'))).toBe('2024-02-29');
  });

  it('месяц назад от января уходит в прошлый год', () => {
    expect(getFromDateForTests('month', new Date('2026-01-15T06:00:00.000Z'))).toBe('2025-12-15');
  });

  it('«всё время» границы не имеет', () => {
    expect(getFromDateForTests('all', lateEvening)).toBeNull();
  });
});
