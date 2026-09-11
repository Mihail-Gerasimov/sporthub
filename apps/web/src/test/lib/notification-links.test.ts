// Карта «предмет уведомления → адрес» (шаг 37.53).
//
// ⚠️ Зачем набор проверяет ВСЕ виды предмета по словарю, а не выписанные руками.
// Пара `subjectType` + `subjectId` лежит в уведомлениях с фазы 36, и до этого шага
// фронт её не читал НИГДЕ. Новый вид предмета (седьмой) добавится в словарь домена
// одной строкой — и забудется здесь ровно так же тихо, как забывались формы
// предмета до шага 36.51. Поэтому ожидания перечислены `Record`'ом по словарю:
// забыть вид нечем — не соберётся ни карта, ни этот набор.
//
// ⚠️ Место — часть ответа, а не украшение. Одна и та же публикация из кабинета
// открывается как СВОЯ карточка, из служебной панели — как карточка МОДЕРАЦИИ.
// Набор проверяет оба места на каждом виде предмета.

import { describe, expect, it } from 'vitest';

import { NOTIFICATION_SUBJECT_TYPES } from '@sporthub/types';
import type { Notification, NotificationSubjectType } from '@sporthub/types';

import {
  cabinetPlace,
  notificationTarget,
  PANEL_PLACE,
  subjectHref,
} from '@/lib/notification-links';
import { faceCabinet, PERSONAL_CABINET } from '@/lib/service-faces';

/** Кабинет лица услуг: клуб №3 у человека, который им управляет. */
const CLUB_CABINET = faceCabinet({ kind: 'club', id: 3, name: 'CrossFit Garage' });

/**
 * Ожидание на каждый вид предмета: адрес из кабинета и адрес из панели.
 *
 * `null` — «в этом месте предмет не открывается», и это ЧАСТЬ ожидания,
 * а не пропуск: раздела записей, отзывов и связей в служебной панели нет вовсе,
 * и мёртвая ссылка туда была бы хуже отсутствия ссылки.
 */
const EXPECTED: Record<
  NotificationSubjectType,
  { id: number; personal: string | null; face: string | null; panel: string | null }
> = {
  // Публикация: своя карточка в кабинете САМОГО лица, карточка модерации в панели.
  // Кабинет, из которого пришли, на адрес не влияет — клуб №42 открывается
  // в кабинете клуба №42.
  club: {
    id: 42,
    personal: '/profile/club/42/publications',
    face: '/profile/club/42/publications',
    panel: '/service-portal/moderation?type=club&id=42',
  },
  trainer: {
    id: 5,
    personal: '/profile/trainer/5/publications',
    face: '/profile/trainer/5/publications',
    panel: '/service-portal/moderation?type=trainer&id=5',
  },
  // Записи: у человека это его расписание, у лица — заявки. В панели раздела
  // записей нет.
  booking: {
    id: 501,
    personal: '/profile/me/schedule',
    face: '/profile/club/3/bookings',
    panel: null,
  },
  // Отзывы есть у обоих кабинетов.
  review: {
    id: 77,
    personal: '/profile/me/reviews',
    face: '/profile/club/3/reviews',
    panel: null,
  },
  // Связи «тренер ↔ клуб» бывают только у лица услуг: человеку связываться нечем.
  link: { id: 10, personal: null, face: '/profile/club/3/links', panel: null },
  // Человек как предмет бывает только у надзорных типов — и смотрят на него
  // только из панели.
  user: { id: 7, personal: null, face: null, panel: '/service-portal/dashboard' },
};

describe('карта «предмет → адрес»', () => {
  it('ожидание описано на КАЖДЫЙ вид предмета из словаря домена', () => {
    // Сторож самого набора: словарь видов один, и он в `@sporthub/types`.
    // Появится седьмой — эта проверка покраснеет раньше, чем выкатка.
    expect(Object.keys(EXPECTED).sort()).toEqual([...NOTIFICATION_SUBJECT_TYPES].sort());
  });

  for (const subjectType of NOTIFICATION_SUBJECT_TYPES) {
    const expected = EXPECTED[subjectType];
    const subject = { subjectType, subjectId: expected.id };

    describe(`предмет «${subjectType}»`, () => {
      it('адрес из служебной панели', () => {
        expect(subjectHref(subject, PANEL_PLACE)).toBe(expected.panel);
      });

      it('адрес из личного кабинета человека', () => {
        expect(subjectHref(subject, cabinetPlace(PERSONAL_CABINET))).toBe(expected.personal);
      });

      it('адрес из кабинета лица услуг', () => {
        expect(subjectHref(subject, cabinetPlace(CLUB_CABINET))).toBe(expected.face);
      });
    });
  }

  it('публикация из кабинета и из панели открывается ПО-РАЗНОМУ', () => {
    // Главное, ради чего у карты вообще есть место. Совпади эти два адреса —
    // модератор ушёл бы править чужую карточку из своего кабинета.
    const subject = { subjectType: 'club' as const, subjectId: 42 };

    expect(subjectHref(subject, PANEL_PLACE)).not.toBe(
      subjectHref(subject, cabinetPlace(CLUB_CABINET)),
    );
  });
});

describe('переход из строки уведомления', () => {
  /** Надзорная строка: владельца-человека у неё нет. */
  function row(type: Notification['type'], payload: Record<string, unknown>): Notification {
    return {
      id: 1,
      createdAt: '2026-09-11T10:00:00.000Z',
      addresseeKind: 'supervision',
      type,
      payload,
    };
  }

  it('строка про скрытую публикацию уводит в модерацию этой публикации', () => {
    const target = notificationTarget(
      row('oversight_publication_hidden', { subjectType: 'club', subjectId: 42 }),
      PANEL_PLACE,
    );

    expect(target).toEqual({ kind: 'open', href: '/service-portal/moderation?type=club&id=42' });
  });

  it('строка про СТЁРТУЮ публикацию не ведёт никуда и говорит почему', () => {
    // ⚠️ Шаг 37.55. Предмета уже нет, а строка осталась — у надзорных строк это
    // норма: событие «публикация стёрта» существует именно потому, что публикации
    // больше нет. Переход отсюда обязан дать понятный ответ, а не 404 и не пустой
    // раздел, в котором человек будет искать, какой фильтр съел карточку.
    const target = notificationTarget(
      row('oversight_publication_deleted', { subjectType: 'club', subjectId: 42 }),
      PANEL_PLACE,
    );

    expect(target.kind).toBe('gone');
    expect(target.kind === 'gone' ? target.note : '').toMatch(/стёрт/i);
  });

  it('строка про стёртую запись — тот же ответ', () => {
    const target = notificationTarget(
      row('oversight_booking_hard_deleted', { subjectType: 'booking', subjectId: 501 }),
      PANEL_PLACE,
    );

    expect(target.kind).toBe('gone');
  });

  it('строка без ссылки на предмет не ведёт никуда — и это не ошибка', () => {
    // Строки старше шага 36.51 и строки, где предмет назвать нечем, обязаны
    // рисоваться как обычные: без ссылки, без плашки и без падения.
    expect(notificationTarget(row('oversight_impersonation_started', {}), PANEL_PLACE)).toEqual({
      kind: 'none',
    });
  });

  it('предмет, который в этом месте не открывается, ссылкой не притворяется', () => {
    expect(
      notificationTarget(
        row('oversight_link_force_revoked', { subjectType: 'link', subjectId: 10 }),
        PANEL_PLACE,
      ),
    ).toEqual({ kind: 'none' });
  });
});
