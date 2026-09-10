// Словарь видов скрытия (шаг 36.12).
//
// Набор маленький, и соблазн «да что там проверять» велик. Проверять здесь есть что:
// весь смысл словаря в том, что третий вид нельзя добавить наполовину, а признак
// нельзя снова начать выводить из текста причины.

import { describe, expect, it } from 'vitest';

import {
  HIDE_KINDS,
  HIDE_KIND_LABELS,
  HIDE_KIND_NOTICE,
  HIDE_KIND_SHOWS_REASON,
  isHideKind,
} from './hide-kind';

describe('словарь видов скрытия', () => {
  it('каждый вид имеет подпись, плашку и решение про причину', () => {
    // ⚠️ Это и есть страховка от «добавили вид, забыли текст». Тип `Record<HideKind, …>`
    // ловит забытое на сборке, но только в тех словарях, которые уже существуют;
    // здесь проверяется, что все три покрывают ВЕСЬ набор, а не пересекаются с ним.
    for (const kind of HIDE_KINDS) {
      expect(HIDE_KIND_LABELS[kind]).toBeTruthy();
      expect(HIDE_KIND_NOTICE[kind]).toBeTruthy();
      expect(typeof HIDE_KIND_SHOWS_REASON[kind]).toBe('boolean');
    }

    expect(Object.keys(HIDE_KIND_LABELS).sort()).toEqual([...HIDE_KINDS].sort());
    expect(Object.keys(HIDE_KIND_NOTICE).sort()).toEqual([...HIDE_KINDS].sort());
  });

  it('архив владельца и скрытие модератором говорят РАЗНОЕ', () => {
    // Самый вероятный дефект этапа — плашка «Скрыто модератором» на клубе,
    // который владелец убрал сам. Если тексты совпадут, различение станет
    // бессмысленным, и этот тест покраснеет раньше, чем это увидит человек.
    expect(HIDE_KIND_NOTICE.owner_archive).not.toBe(HIDE_KIND_NOTICE.moderation);
    expect(HIDE_KIND_LABELS.owner_archive).not.toBe(HIDE_KIND_LABELS.moderation);
  });

  it('плашка архива не говорит про модератора', () => {
    expect(HIDE_KIND_NOTICE.owner_archive.toLowerCase()).not.toContain('модератор');
  });

  it('причина показывается только там, где она что-то значит', () => {
    // У архива причина служебная и человеку ничего не сообщает.
    expect(HIDE_KIND_SHOWS_REASON.owner_archive).toBe(false);
    expect(HIDE_KIND_SHOWS_REASON.moderation).toBe(true);
  });

  it('чужое значение видом скрытия не считается', () => {
    expect(isHideKind('moderation')).toBe(true);
    expect(isHideKind('owner_archive')).toBe(true);
    expect(isHideKind('quarantine')).toBe(false);
    expect(isHideKind(undefined)).toBe(false);
    expect(isHideKind(null)).toBe(false);
  });
});
