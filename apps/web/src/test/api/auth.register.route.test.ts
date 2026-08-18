// Phase 26 Step 26.7: POST /api/auth/register — создаёт user через db.createUser.
// Mapping accountType → role: athlete → 'athlete'; provider → 'club_owner'
// (при регистрации UI всегда club_owner; tranier возникает только в seed).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/auth/register/route';
import { getUsers } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('POST /api/auth/register (Step 26.7)', () => {
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

  function makeRequest(body: unknown): Request {
    return new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('201 для нового athlete — user появился в getUsers с правильной ролью', async () => {
    const res = await POST(
      makeRequest({
        name: 'Новый Пользователь',
        email: 'new@test.local',
        password: 'pass12345',
        accountType: 'athlete',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(4);
    expect(json.data.password).toBeUndefined();

    const users = await getUsers();
    expect(users).toHaveLength(4);
    const created = users.find((u) => u.id === 4);
    expect(created?.role).toBe('athlete');
    expect(created?.password).toBe('pass12345');
  });

  it('201 для нового provider → role=club_owner', async () => {
    const res = await POST(
      makeRequest({
        name: 'Новый Провайдер',
        email: 'provider@test.local',
        password: 'pass12345',
        accountType: 'provider',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    const users = await getUsers();
    expect(users.find((u) => u.id === 4)?.role).toBe('club_owner');
  });

  it('409 если email уже зарегистрирован', async () => {
    const res = await POST(
      makeRequest({
        name: 'Дубликат',
        email: 'alexey@sporthub.local',
        password: 'pass12345',
        accountType: 'athlete',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/зарегистрирован/i);

    const users = await getUsers();
    expect(users).toHaveLength(3);
  });

  it('400 для невалидного input (короткий name / плохой email)', async () => {
    const res = await POST(
      makeRequest({ name: 'A', email: 'not-an-email', password: 'pass', accountType: 'athlete' }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
