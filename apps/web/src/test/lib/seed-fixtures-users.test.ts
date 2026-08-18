// Phase 26 Step 26.6: seedTestData пишет users.json с fixtureUsers, чтобы тесты
// не зависели от расширенного production-seed (после обогащения до 7 юзеров
// analytics.route.test.ts с `totalUsers=3` продолжает работать от isolated fixtures).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getUsers } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { fixtureUsers, seedTestData } from '@/test/helpers/seed-fixtures';

describe('seedTestData пишет fixtureUsers (Step 26.6)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('fixtureUsers содержит 3 записи: athlete id=1, club_owner id=2, admin id=3', () => {
    expect(fixtureUsers).toHaveLength(3);
    expect(fixtureUsers.map((u) => ({ id: u.id, role: u.role }))).toEqual([
      { id: 1, role: 'athlete' },
      { id: 2, role: 'club_owner' },
      { id: 3, role: 'admin' },
    ]);
  });

  it('getUsers возвращает ровно 3 записи из isolated seed (не production)', async () => {
    const users = await getUsers();
    expect(users).toHaveLength(3);
    expect(users.map((u) => u.role).sort()).toEqual(['admin', 'athlete', 'club_owner']);
  });
});
