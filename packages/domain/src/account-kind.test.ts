// Подпись исполнителя действия (шаг 35.24).
//
// Журнал хранит `logs.actor_role` — снимок того, кем был исполнитель в момент
// действия. Фаза 35 сменила то, что туда пишется: до неё это было имя роли
// (`athlete`, `club_owner`, `trainer`), после — вид учётной записи
// (`person`, `admin`). Старые строки никуда не делись: на живой базе их 94 из 101.
//
// Отсюда единственное требование к подписи — читать ОБА вида значений. Проверка
// нужна именно здесь, потому что сломать её нельзя заметить иначе: удаление
// прошлого словаря компилятор пропустит, а раздел журнала молча начнёт показывать
// сырое `club_owner` вместо «Провайдер».

import { describe, expect, it } from 'vitest';

import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, actorLabel } from './account-kind';

/** Значения, которые лежат в журнале с прошлых фаз. Список закрыт: ролей больше нет. */
const LEGACY_ACTOR_VALUES = ['athlete', 'club_owner', 'trainer', 'admin'] as const;

describe('Подпись исполнителя в журнале', () => {
  it('подписывает нынешние виды учётной записи', () => {
    for (const kind of ACCOUNT_KINDS) {
      expect(actorLabel(kind)).toBe(ACCOUNT_KIND_LABELS[kind]);
    }
  });

  it('подписывает значения ролей, записанные до фазы 35', () => {
    // ⚠️ Главное в наборе: удаление роли не должно делать прошлое нечитаемым.
    expect(actorLabel('athlete')).toBe('Спортсмен');
    expect(actorLabel('club_owner')).toBe('Провайдер');
    expect(actorLabel('trainer')).toBe('Тренер');
    expect(actorLabel('admin')).toBe('Администратор');
  });

  it('ни одно значение из журнала не остаётся без человеческой подписи', () => {
    for (const value of [...LEGACY_ACTOR_VALUES, ...ACCOUNT_KINDS]) {
      const label = actorLabel(value);

      expect(label, `значение ${value} осталось сырым`).not.toBe(value);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('незнакомое значение показывается как есть, а не пустотой', () => {
    // В журнал может попасть строка, которой нет ни в одном словаре, — например
    // из чужой выгрузки. Пустая строка в разделе выглядела бы как потерянная запись.
    expect(actorLabel('нечто')).toBe('нечто');
  });
});
