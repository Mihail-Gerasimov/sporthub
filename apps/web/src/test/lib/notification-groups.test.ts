// Подписи к темам уведомлений.
//
// ⚠️ Зачем проверять словарь подписей. Ключи тем объявлены ОДИН раз — в
// `NOTIFICATION_GROUP_KEYS` (`packages/domain`). Подписи к ним жили внутри
// `NotificationsListPage`, и надзорной ленте администратора пришлось бы завести
// свои: получилось бы два словаря подписей к одному словарю ключей, и «Модерация»
// в одной ленте против «Надзор» в другой — это расхождение, которое никто
// не заметит, пока не откроет обе.
//
// Набор сторожит связь: подпись есть у каждого ключа домена и лишних ключей нет.

import { NOTIFICATION_GROUP_KEYS } from '@sporthub/domain';
import { describe, expect, it } from 'vitest';

import { NOTIFICATION_GROUP_LABELS } from '@/lib/notification-groups';

describe('подписи к темам уведомлений', () => {
  it('у каждой темы домена есть подпись', () => {
    for (const key of NOTIFICATION_GROUP_KEYS) {
      expect(NOTIFICATION_GROUP_LABELS[key]).toBeTruthy();
    }
  });

  it('псевдо-тема «все» объявлена здесь же — фильтр без неё не собрать', () => {
    expect(NOTIFICATION_GROUP_LABELS.all).toBeTruthy();
  });

  it('лишних подписей нет: словарь — это ровно темы домена плюс «все»', () => {
    // ⚠️ Обратная сторона проверки выше. Без неё в словаре могла бы остаться
    // подпись к вырезанной теме — ровно так фаза 35 оставила в настройках
    // мёртвые строки вырезанного карантина.
    expect(Object.keys(NOTIFICATION_GROUP_LABELS).sort()).toEqual(
      ['all', ...NOTIFICATION_GROUP_KEYS].sort(),
    );
  });
});
