/**
 * Тесты GET/POST /api/logs.
 * Phase 20 — Step 20.3 (GET) + Step 20.5 (POST).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET, POST } from '@/app/api/logs/route';
import { appendLog, getLogs } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('GET /api/logs', () => {
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

  /** Хелпер: добавить набор логов для тестирования фильтров. */
  async function seedLogs() {
    await appendLog({
      action: 'publish_create',
      actorId: 2,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: 10,
      meta: { name: 'Club A' },
    });
    // Небольшая задержка для разных createdAt
    await new Promise((r) => setTimeout(r, 10));
    await appendLog({
      action: 'booking_create',
      actorId: 1,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: 1,
    });
    await new Promise((r) => setTimeout(r, 10));
    await appendLog({
      action: 'publish_update',
      actorId: 2,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: 10,
    });
    await new Promise((r) => setTimeout(r, 10));
    await appendLog({
      action: 'admin_login',
      actorId: 3,
      actorRole: 'admin',
      entityType: 'user',
      entityId: 3,
    });
  }

  it('возвращает все логи без параметров, отсортированные по createdAt desc', async () => {
    await seedLogs();

    const request = new Request('http://localhost/api/logs');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(4);
    expect(json.total).toBe(4);
    expect(json.offset).toBe(0);
    expect(json.limit).toBe(50);
    // Первый — самый новый (admin_login)
    expect(json.data[0].action).toBe('admin_login');
    expect(json.data[3].action).toBe('publish_create');
  });

  it('фильтрует по action', async () => {
    await seedLogs();

    const request = new Request('http://localhost/api/logs?action=publish_create');
    const response = await GET(request);
    const json = await response.json();

    expect(json.data).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.data[0].action).toBe('publish_create');
  });

  it('фильтрует по actorId', async () => {
    await seedLogs();

    const request = new Request('http://localhost/api/logs?actorId=2');
    const response = await GET(request);
    const json = await response.json();

    expect(json.data).toHaveLength(2);
    expect(json.data.every((l: { actorId: number }) => l.actorId === 2)).toBe(true);
  });

  it('фильтрует по from/to диапазону', async () => {
    await seedLogs();

    const now = new Date();
    const from = new Date(now.getTime() - 60_000).toISOString();
    const to = new Date(now.getTime() + 60_000).toISOString();

    const request = new Request(`http://localhost/api/logs?from=${from}&to=${to}`);
    const response = await GET(request);
    const json = await response.json();

    // Все 4 лога попадают в диапазон ±1 минута
    expect(json.total).toBe(4);
  });

  it('комбинирует фильтры action + actorId', async () => {
    await seedLogs();

    const request = new Request('http://localhost/api/logs?action=publish_create&actorId=2');
    const response = await GET(request);
    const json = await response.json();

    expect(json.data).toHaveLength(1);
    expect(json.data[0].action).toBe('publish_create');
    expect(json.data[0].actorId).toBe(2);
  });

  it('пагинация offset/limit — первая страница', async () => {
    await seedLogs();

    const request = new Request('http://localhost/api/logs?offset=0&limit=2');
    const response = await GET(request);
    const json = await response.json();

    expect(json.data).toHaveLength(2);
    expect(json.total).toBe(4);
    expect(json.offset).toBe(0);
    expect(json.limit).toBe(2);
    // Первые два — самые новые
    expect(json.data[0].action).toBe('admin_login');
    expect(json.data[1].action).toBe('publish_update');
  });

  it('пагинация offset/limit — вторая страница', async () => {
    await seedLogs();

    const request = new Request('http://localhost/api/logs?offset=2&limit=2');
    const response = await GET(request);
    const json = await response.json();

    expect(json.data).toHaveLength(2);
    expect(json.total).toBe(4);
    expect(json.offset).toBe(2);
    expect(json.data[0].action).toBe('booking_create');
    expect(json.data[1].action).toBe('publish_create');
  });

  it('offset больше total → пустой data, корректный total', async () => {
    await seedLogs();

    const request = new Request('http://localhost/api/logs?offset=100');
    const response = await GET(request);
    const json = await response.json();

    expect(json.data).toHaveLength(0);
    expect(json.total).toBe(4);
  });

  it('пустая коллекция логов → data: [], total: 0', async () => {
    const request = new Request('http://localhost/api/logs');
    const response = await GET(request);
    const json = await response.json();

    expect(json.data).toEqual([]);
    expect(json.total).toBe(0);
    expect(json.offset).toBe(0);
    expect(json.limit).toBe(50);
  });
});

describe('POST /api/logs — запись логов из клиента (Step 20.5)', () => {
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

  it('валидный payload → запись создаётся, статус 201', async () => {
    const request = new Request('http://localhost/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'admin_login',
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 3,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.action).toBe('admin_login');
    expect(json.data.actorId).toBe(3);
    expect(json.data.id).toBeDefined();
    expect(json.data.createdAt).toBeDefined();

    // Проверяем что запись реально в коллекции
    const logs = await getLogs();
    expect(logs).toHaveLength(1);
  });

  it('невалидный payload (пропущены обязательные поля) → 400', async () => {
    const request = new Request('http://localhost/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_login' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('невалидный action → 400', async () => {
    const request = new Request('http://localhost/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'invalid_action',
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 3,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('admin_impersonate_start сохраняет meta с targetUserName', async () => {
    const request = new Request('http://localhost/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'admin_impersonate_start',
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 1,
        meta: { targetUserName: 'Иван Спортсмен', targetAccountType: 'athlete' },
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.actorId).toBe(3);
    expect(json.data.entityId).toBe(1);
    expect(json.data.meta).toMatchObject({
      targetUserName: 'Иван Спортсмен',
      targetAccountType: 'athlete',
    });
  });
});
