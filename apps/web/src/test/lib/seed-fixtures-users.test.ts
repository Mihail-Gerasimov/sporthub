// Состав общего набора пользователей.
//
// Раньше проверка шла через файл: тест засеивал временную копию каталога данных
// и читал `users.json` обратно. Каталога у фронта больше нет — данными владеет
// бэкенд, — поэтому проверяется сам набор фикстур, единственный источник которого
// теперь `@sporthub/fixtures`.
import { describe, expect, it } from 'vitest';

import { fixtureUsers } from '@sporthub/fixtures';

describe('Общий набор пользователей', () => {
  it('содержит 3 записи: athlete id=1, club_owner id=2, admin id=3', () => {
    expect(fixtureUsers).toHaveLength(3);
    expect(fixtureUsers.map((user) => ({ id: user.id, role: user.role }))).toEqual([
      { id: 1, role: 'athlete' },
      { id: 2, role: 'club_owner' },
      { id: 3, role: 'admin' },
    ]);
  });

  it('роли не повторяются — каждая сторона представлена ровно одним человеком', () => {
    expect(fixtureUsers.map((user) => user.role).sort()).toEqual([
      'admin',
      'athlete',
      'club_owner',
    ]);
  });
});
