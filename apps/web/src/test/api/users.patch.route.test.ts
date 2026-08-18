/**
 * Phase 29 Step 29.5: тесты PATCH /api/users/[id]
 * Покрывают happy paths (phone, password+currentPassword) и edge-cases:
 * 400 invalid body, 401 wrong currentPassword, 403 not self, 404 not found,
 * sanitize response (без password).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PATCH } from '@/app/api/users/[id]/route';
import { getUserById, updateUser } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

function makeRequest(
  id: number,
  body: unknown,
): { request: Request; params: Promise<{ id: string }> } {
  return {
    request: new Request(`http://localhost:3000/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ id: String(id) }),
  };
}

describe('PATCH /api/users/[id] — Phase 29 Step 29.5', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    // Зададим явный пароль для user 1, чтобы знать current.
    await updateUser(1, { password: 'demo123' });
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('обновляет phone — возвращает sanitized user без password', async () => {
    const { request, params } = makeRequest(1, { userId: 1, phone: '+7 (900) 111-22-33' });
    const response = await PATCH(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.phone).toBe('+7 (900) 111-22-33');
    expect(body.data).not.toHaveProperty('password');

    const stored = await getUserById(1);
    expect(stored?.phone).toBe('+7 (900) 111-22-33');
  });

  it('обновляет password при правильном currentPassword', async () => {
    const { request, params } = makeRequest(1, {
      userId: 1,
      password: 'newpass99',
      currentPassword: 'demo123',
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    const stored = await getUserById(1);
    expect(stored?.password).toBe('newpass99');
  });

  it('401 при неверном currentPassword', async () => {
    const { request, params } = makeRequest(1, {
      userId: 1,
      password: 'newpass99',
      currentPassword: 'wrong',
    });
    const response = await PATCH(request, { params });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/Неверный текущий пароль/);
    const stored = await getUserById(1);
    expect(stored?.password).toBe('demo123');
  });

  it('400 если меняется password без currentPassword', async () => {
    const { request, params } = makeRequest(1, { userId: 1, password: 'newpass99' });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('400 при пустом patch (нет phone и password)', async () => {
    const { request, params } = makeRequest(1, { userId: 1 });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('400 при некорректном формате phone', async () => {
    const { request, params } = makeRequest(1, { userId: 1, phone: 'not a phone' });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('400 при коротком password (<6)', async () => {
    const { request, params } = makeRequest(1, {
      userId: 1,
      password: '12345',
      currentPassword: 'demo123',
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it('403 при попытке поменять чужого пользователя', async () => {
    const { request, params } = makeRequest(1, { userId: 2, phone: '+7 (900) 000-00-00' });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(403);
  });

  it('404 при несуществующем пользователе', async () => {
    const { request, params } = makeRequest(99_999, {
      userId: 99_999,
      phone: '+7 (900) 000-00-00',
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(404);
  });

  it('phone и password обновляются вместе', async () => {
    const { request, params } = makeRequest(1, {
      userId: 1,
      phone: '+7 (900) 111-22-33',
      password: 'newpass99',
      currentPassword: 'demo123',
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    const stored = await getUserById(1);
    expect(stored?.phone).toBe('+7 (900) 111-22-33');
    expect(stored?.password).toBe('newpass99');
  });
});
