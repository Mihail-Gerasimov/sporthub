// Тесты словаря действий модерации (фаза 38, шаг 38.38).
//
// Проверяется не «контроллер что-то делает», а сам словарь: у каждого действия
// все шесть полей, тексты отказов — здесь, патч — по конвенции обнуления.
// Контроллер читает словарь, и его тесты (`moderation.controller.test.ts`)
// проверяют поведение маршрута; здесь — что словарь говорит то, что должен.

import { describe, expect, it } from 'vitest';

import {
  MODERATION_ACTIONS,
  MODERATION_ACTION_SPECS,
  MODERATION_ERRORS,
  isModerationAction,
} from './moderation-actions';

const CONTEXT = { reason: 'жалоба', actorId: 3, now: new Date('2026-09-15T10:00:00.000Z') };

describe('словарь действий модерации', () => {
  it('у каждого действия есть строка со всеми шестью полями', () => {
    for (const action of MODERATION_ACTIONS) {
      const spec = MODERATION_ACTION_SPECS[action];

      expect(Object.keys(spec).sort()).toEqual(
        [
          'logAction',
          'ownerNoticeType',
          'oversightType',
          'patch',
          'precondition',
          'requiresReason',
        ].sort(),
      );
      expect(typeof spec.patch).toBe('function');
    }
  });

  it('распознаёт действие по строке и отвергает остальное', () => {
    expect(isModerationAction('hide')).toBe(true);
    expect(isModerationAction('unhide')).toBe(true);
    expect(isModerationAction('verify')).toBe(true);
    expect(isModerationAction('unverify')).toBe(true);
    expect(isModerationAction('delete')).toBe(false);
    expect(isModerationAction(42)).toBe(false);
  });

  it('текст отказа перечисляет ВСЕ действия словаря', () => {
    // Собирается из словаря, а не написан руками: пятое действие меняет текст само.
    for (const action of MODERATION_ACTIONS) {
      expect(MODERATION_ERRORS.unknownAction).toContain(action);
    }
    expect(MODERATION_ERRORS.unknownAction).toBe(
      'Некорректное действие. Ожидается hide, unhide, verify или unverify',
    );
  });

  it('скрытие требует причину с закреплённым текстом, возврат — нет', () => {
    expect(MODERATION_ACTION_SPECS.hide.requiresReason).toBe('Причина скрытия обязательна');
    expect(MODERATION_ACTION_SPECS.unhide.requiresReason).toBe(false);
  });

  it('скрытие пишет вид, причину, исполнителя и момент; признак повторной проверки гасит', () => {
    expect(MODERATION_ACTION_SPECS.hide.patch(CONTEXT)).toEqual({
      status: 'hidden',
      hideReason: 'жалоба',
      hiddenByUserId: 3,
      hiddenAt: '2026-09-15T10:00:00.000Z',
      hiddenKind: 'moderation',
      awaitingRecheck: false,
    });
  });

  it('возврат ОБНУЛЯЕТ поля скрытия ключами с undefined, а не пропускает их', () => {
    // Конвенция словаря: ключ с `undefined` — стереть колонку. Пропущенный ключ
    // оставил бы причину и вид скрытия на возвращённой публикации.
    const patch = MODERATION_ACTION_SPECS.unhide.patch(CONTEXT);

    expect(patch.status).toBe('published');
    expect(patch.awaitingRecheck).toBe(false);

    for (const key of ['hideReason', 'hiddenByUserId', 'hiddenAt', 'hiddenKind'] as const) {
      expect(key in patch, `в патче возврата нет ключа ${key}`).toBe(true);
      expect(patch[key]).toBeUndefined();
    }
  });

  it('очередь надзора получает строку о скрытии и не получает о возврате', () => {
    expect(MODERATION_ACTION_SPECS.hide.oversightType).toBe('oversight_publication_hidden');
    expect(MODERATION_ACTION_SPECS.unhide.oversightType).toBeNull();
  });

  it('владелец узнаёт об обоих решениях', () => {
    expect(MODERATION_ACTION_SPECS.hide.ownerNoticeType).toBe('publication_hidden_for_owner');
    expect(MODERATION_ACTION_SPECS.unhide.ownerNoticeType).toBe('publication_unhidden_for_owner');
  });

  it('скрыть можно только без живых записей; возврат условий не ставит', () => {
    expect(MODERATION_ACTION_SPECS.hide.precondition).toBe('no_live_bookings');
    expect(MODERATION_ACTION_SPECS.unhide.precondition).toBeNull();
  });

  // --- Верификация (38.45–38.46) ---
  it('verify пишет пару «когда + кем» и не требует причины; отзыв требует', () => {
    expect(MODERATION_ACTION_SPECS.verify.patch(CONTEXT)).toEqual({
      verifiedAt: '2026-09-15T10:00:00.000Z',
      verifiedByUserId: 3,
    });
    expect(MODERATION_ACTION_SPECS.verify.requiresReason).toBe(false);
    expect(MODERATION_ACTION_SPECS.unverify.requiresReason).toBe('Причина отзыва обязательна');
  });

  it('unverify обнуляет обе половины пары ключами с undefined', () => {
    const patch = MODERATION_ACTION_SPECS.unverify.patch(CONTEXT);

    for (const key of ['verifiedAt', 'verifiedByUserId'] as const) {
      expect(key in patch, `в патче отзыва нет ключа ${key}`).toBe(true);
      expect(patch[key]).toBeUndefined();
    }
  });

  it('очередь надзора узнаёт об отзыве и не узнаёт о подтверждении; владелец — об обоих', () => {
    expect(MODERATION_ACTION_SPECS.verify.oversightType).toBeNull();
    expect(MODERATION_ACTION_SPECS.unverify.oversightType).toBe('oversight_verification_revoked');
    expect(MODERATION_ACTION_SPECS.verify.ownerNoticeType).toBe('publication_verified_for_owner');
    expect(MODERATION_ACTION_SPECS.unverify.ownerNoticeType).toBe(
      'publication_verification_revoked_for_owner',
    );
    expect(MODERATION_ACTION_SPECS.verify.precondition).toBe('published');
    expect(MODERATION_ACTION_SPECS.unverify.precondition).toBe('verified');
  });
});
