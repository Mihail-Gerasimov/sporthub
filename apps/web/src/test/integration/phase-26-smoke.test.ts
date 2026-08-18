// Phase 26 Step 26.8: integration smoke для подтверждения ключевых новых потоков
// фазы после удаления 3 legacy-integration тестов в Step 26.5. Проверяет
// end-to-end цепочку: register → createUser в users.json → login → sanitized user.
// Без UI — API-уровень + db, достаточно чтобы поймать регрессии в auth-flow.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as registerPOST } from '@/app/api/auth/register/route';
import { getUsers } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('Phase 26 smoke: register → login → users.json consistency', () => {
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

  function jsonRequest(url: string, body: unknown): Request {
    return new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('регистрация нового athlete пишет user в users.json и возвращает id', async () => {
    const before = await getUsers();
    expect(before).toHaveLength(3);

    const res = await registerPOST(
      jsonRequest('http://localhost:3000/api/auth/register', {
        name: 'Smoke Athlete',
        email: 'smoke@test.local',
        password: 'testpass',
        accountType: 'athlete',
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(4);

    const after = await getUsers();
    expect(after).toHaveLength(4);
    expect(after.find((u) => u.email === 'smoke@test.local')?.role).toBe('athlete');
  });

  it('register → login: новый пользователь может сразу залогиниться', async () => {
    // register
    const regRes = await registerPOST(
      jsonRequest('http://localhost:3000/api/auth/register', {
        name: 'Smoke Provider',
        email: 'smoke-provider@test.local',
        password: 'testpass',
        accountType: 'provider',
      }),
    );
    expect(regRes.status).toBe(201);

    // login с тем же email
    const loginRes = await loginPOST(
      jsonRequest('http://localhost:3000/api/auth/login', {
        email: 'smoke-provider@test.local',
        accountType: 'provider',
      }),
    );
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.data.id).toBe(4);
    expect(loginJson.data.email).toBe('smoke-provider@test.local');
    // password санирован из ответа
    expect(loginJson.data.password).toBeUndefined();
  });

  it('login как athlete с email провайдера → 403 (role mismatch)', async () => {
    const res = await loginPOST(
      jsonRequest('http://localhost:3000/api/auth/login', {
        email: 'marina@studio.local', // club_owner в fixtures
        accountType: 'athlete',
      }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/тип кабинета/i);
  });
});
