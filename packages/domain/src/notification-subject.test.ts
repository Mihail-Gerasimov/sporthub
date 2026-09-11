// Предмет уведомления: словарь, построитель и чтение (шаг 36.51).
//
// ⚠️ Набор ОБХОДИТ ВСЕ типы уведомлений, а не перечисляет удачные примеры:
// список берётся у самого словаря. Тип, добавленный завтра, попадает сюда сам —
// именно этого не хватало, когда каждая фаза заводила свою форму ссылки.

import { describe, expect, it } from 'vitest';

import { NOTIFICATION_SUBJECT_TYPES, type NotificationType } from '@sporthub/types';

import {
  NOTIFICATION_TYPE_GROUP,
  NOTIFICATION_TYPE_SUBJECT,
  notificationPayload,
  readNotificationSubject,
} from './notification-types';

const ALL_TYPES = Object.keys(NOTIFICATION_TYPE_GROUP) as NotificationType[];

describe('Предмет уведомления', () => {
  it('каждый тип называет хотя бы один вид предмета, и все виды — из словаря', () => {
    for (const type of ALL_TYPES) {
      const subjects = NOTIFICATION_TYPE_SUBJECT[type];

      expect(subjects.length, `тип ${type} не назвал предмет`).toBeGreaterThan(0);

      for (const subject of subjects) {
        expect(NOTIFICATION_SUBJECT_TYPES, `тип ${type}: неизвестный вид предмета`).toContain(
          subject,
        );
      }
    }
  });

  it('построитель кладёт ссылку одной формой — и её же читает обратно', () => {
    for (const type of ALL_TYPES) {
      for (const subject of NOTIFICATION_TYPE_SUBJECT[type]) {
        // `as never` — тип вида предмета сужается по типу уведомления на сборке;
        // здесь вид берётся из словаря в цикле, и сузить его статически нечем.
        const payload = notificationPayload(type, subject as never, 42, { extra: 'да' });

        expect(payload).toEqual({ subjectType: subject, subjectId: 42, extra: 'да' });
        expect(readNotificationSubject(payload)).toEqual({ subjectType: subject, subjectId: 42 });
      }
    }
  });

  it('чужая или неполная ссылка не читается', () => {
    // Прежние формы — именно то, чего читатель больше не понимает: строки
    // переведены миграцией, и молчаливый разбор второй формы означал бы,
    // что она жива дальше.
    expect(readNotificationSubject({ clubId: 7 })).toBeNull();
    expect(readNotificationSubject({ entityType: 'club', entityId: 7 })).toBeNull();
    expect(readNotificationSubject({ subjectType: 'club' })).toBeNull();
    expect(readNotificationSubject({ subjectType: 'coach', subjectId: 7 })).toBeNull();
    // Номер строкой — тоже не ссылка: читатель сравнивает числа.
    expect(readNotificationSubject({ subjectType: 'club', subjectId: '7' })).toBeNull();
  });
});
