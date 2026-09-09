// Состав общего набора пользователей.
//
// Раньше проверка шла через файл: тест засеивал временную копию каталога данных
// и читал `users.json` обратно. Каталога у фронта больше нет — данными владеет
// бэкенд, — поэтому проверяется сам набор фикстур, единственный источник которого
// теперь `@sporthub/fixtures`.
//
// ⚠️ Шаг 35.24. Прежде набор описывался ролями: «athlete id=1, club_owner id=2,
// admin id=3, trainer id=4». Ролей больше нет, и описывать людей стало нечем,
// кроме того, что о них правда: один назначен администратором, остальные —
// обычные люди, а различает их ВЛАДЕНИЕ лицами услуг.
import { describe, expect, it } from 'vitest';

import { fixtureClub, fixtureTrainer, fixtureUsers } from '@sporthub/fixtures';
import { accountKindOf } from '@sporthub/domain';

describe('Общий набор пользователей', () => {
  it('содержит четверых: администратора и троих обычных людей', () => {
    expect(fixtureUsers).toHaveLength(4);
    expect(fixtureUsers.map((user) => ({ id: user.id, kind: accountKindOf(user) }))).toEqual([
      { id: 1, kind: 'person' },
      { id: 2, kind: 'person' },
      { id: 3, kind: 'admin' },
      { id: 4, kind: 'person' },
    ]);
  });

  it('администратор ровно один — его признак не выводится из владения', () => {
    const admins = fixtureUsers.filter((user) => accountKindOf(user) === 'admin');

    expect(admins.map((user) => user.id)).toEqual([3]);
  });

  it('лица услуг набора принадлежат одному человеку, а прочие людьми и остаются', () => {
    // Ровно та проверка, которую роль подменяла собой: «провайдер» — это не признак
    // у человека, а факт владения клубом и карточкой тренера.
    expect(fixtureClub.managedByUserId).toBe(2);
    expect(fixtureTrainer.managedByUserId).toBe(2);

    const owners = new Set([fixtureClub.managedByUserId, fixtureTrainer.managedByUserId]);

    expect([...owners]).toEqual([2]);
  });
});
