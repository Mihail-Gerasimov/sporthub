// Phase 26 Step 26.7: POST /api/auth/login — fake auth по email из users.json.
// Password не проверяется (MVP). Проверки: 404 если нет, 403 admin (через
// /service-portal), 403 при несоответствии role ↔ accountType.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/auth/login/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('POST /api/auth/login (Step 26.7)', () => {
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
    return new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('200 для athlete-логина с валидным email', async () => {
    const res = await POST(makeRequest({ email: 'alexey@sporthub.local', accountType: 'athlete' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(1);
    expect(json.data.name).toBe('Алексей Смирнов');
    // password не должен утекать в ответ
    expect(json.data.password).toBeUndefined();
  });

  it('404 для несуществующего email', async () => {
    const res = await POST(makeRequest({ email: 'nope@nowhere.local', accountType: 'athlete' }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/не найден/i);
  });

  it('403 при несоответствии accountType и роли (club_owner пытается как athlete)', async () => {
    const res = await POST(makeRequest({ email: 'marina@studio.local', accountType: 'athlete' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/тип кабинета/i);
  });

  it('403 для админа (должен входить через /service-portal)', async () => {
    const res = await POST(makeRequest({ email: 'admin@sporthub.local', accountType: 'athlete' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/service-portal|администрат/i);
  });
});
