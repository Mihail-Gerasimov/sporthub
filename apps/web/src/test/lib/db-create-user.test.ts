// Phase 26 Step 26.7: db.createUser следует паттерну createTrainerClubLink /
// createProviderClientNote — id и createdAt назначает сервер, пишет в users.json.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createUser, getUsers } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('db.createUser (Step 26.7)', () => {
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

  it('назначает id (next) и createdAt, записывает в users.json', async () => {
    const before = await getUsers();
    expect(before).toHaveLength(3);

    const created = await createUser({
      role: 'athlete',
      status: 'active',
      name: 'Новый Пользователь',
      email: 'new@test.local',
      phone: '',
      password: 'pass',
      favoriteClubIds: [],
    });

    expect(created.id).toBe(4);
    expect(created.createdAt).toBeTruthy();
    expect(created.name).toBe('Новый Пользователь');
    expect(created.role).toBe('athlete');

    const after = await getUsers();
    expect(after).toHaveLength(4);
    expect(after.find((u) => u.id === 4)?.email).toBe('new@test.local');
  });

  it('последовательно назначает id при нескольких вызовах', async () => {
    const a = await createUser({
      role: 'athlete',
      status: 'active',
      name: 'A',
      email: 'a@test.local',
      phone: '',
      password: 'p',
      favoriteClubIds: [],
    });
    const b = await createUser({
      role: 'club_owner',
      status: 'active',
      name: 'B',
      email: 'b@test.local',
      phone: '',
      password: 'p',
      favoriteClubIds: [],
    });

    expect(b.id).toBe(a.id + 1);
    const users = await getUsers();
    expect(users).toHaveLength(5);
  });
});
