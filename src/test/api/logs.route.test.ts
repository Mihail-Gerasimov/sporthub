/**
 * Тесты GET /api/logs — первый paginated endpoint проекта.
 * Phase 20 — Step 20.3: фильтрация, сортировка, пагинация.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/logs/route';
import { appendLog } from '@/lib/db';
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
