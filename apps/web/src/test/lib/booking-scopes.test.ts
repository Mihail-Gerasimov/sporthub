// Сторож набора статусов, которым страницы сужают запрос истории клиентов.
//
// Набор объявлен отдельно от бэкенда — иначе сузить запрос было бы нечем. Разъехавшись
// с тем, что читает раздел «Клиенты», он даёт самую тихую поломку из возможных:
// страница спрашивает меньше, чем читает, счётчик становится меньше, а выглядит всё
// по-прежнему рабочим.
//
// ⚠️ Фаза 38, шаг 38.25: прежде набор звался «статусы надёжности атлета» и проверялся
// через саму доменную функцию расчёта — прогоном записей всех восьми статусов.
// Расчёта больше нет, и проверяется само ОБЪЯВЛЕНИЕ: ровно три статуса истории
// клиента, каждый — законный статус записи (реестр `phase-38-reliability-cut.md`, Т7).

import { BOOKING_STATUSES } from '@sporthub/types';
import { describe, expect, it } from 'vitest';

import { CLIENT_HISTORY_STATUSES } from '@/lib/booking-scopes';

describe('CLIENT_HISTORY_STATUSES — срез истории клиента', () => {
  it('состоит ровно из завершённых, неявок и отмен самим клиентом', () => {
    expect([...CLIENT_HISTORY_STATUSES].sort()).toEqual(
      ['cancelled_by_athlete', 'completed', 'no_show'].sort(),
    );
  });

  it('каждый статус набора — законный статус записи', () => {
    for (const status of CLIENT_HISTORY_STATUSES) {
      expect(BOOKING_STATUSES).toContain(status);
    }
  });

  it('набор не содержит повторов: сужение запроса не должно слать один статус дважды', () => {
    expect(new Set(CLIENT_HISTORY_STATUSES).size).toBe(CLIENT_HISTORY_STATUSES.length);
  });
});
