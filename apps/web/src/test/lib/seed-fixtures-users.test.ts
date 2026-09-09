// Состав общего набора пользователей.
//
// Раньше проверка шла через файл: тест засеивал временную копию каталога данных
// и читал `users.json` обратно. Каталога у фронта больше нет — данными владеет
// бэкенд, — поэтому проверяется сам набор фикстур, единственный источник которого
// теперь `@sporthub/fixtures`.
import { describe, expect, it } from 'vitest';

import { fixtureUsers } from '@sporthub/fixtures';
import { USER_ROLES } from '@sporthub/types';

describe('Общий набор пользователей', () => {
  it('содержит 4 записи: athlete id=1, club_owner id=2, admin id=3, trainer id=4', () => {
    // Тренер добавлен на этапе Э8a фазы 34: до него роль существовала с фазы 4,
    // но ни одного человека с ней в общем наборе не было — и ветка входа тренером
    // не проверялась нигде.
    expect(fixtureUsers).toHaveLength(4);
    expect(fixtureUsers.map((user) => ({ id: user.id, role: user.role }))).toEqual([
      { id: 1, role: 'athlete' },
      { id: 2, role: 'club_owner' },
      { id: 3, role: 'admin' },
      { id: 4, role: 'trainer' },
    ]);
  });

  it('роли не повторяются — каждая сторона представлена ровно одним человеком', () => {
    // Полнота проверяется по словарю ролей, а не по выписанному списку: новая роль
    // обязана появиться и здесь, и словарь об этом напомнит сам.
    expect(fixtureUsers.map((user) => user.role).sort()).toEqual([...USER_ROLES].sort());
  });
});
