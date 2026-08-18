// Phase 25 Step 25.10: тесты API /api/provider-client-notes.
// POST / (create) + GET / (list) + PATCH /[id] + DELETE /[id] с ownership-guard'ами.
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DELETE as deleteRoute,
  PATCH as patchRoute,
} from '@/app/api/provider-client-notes/[id]/route';
import { GET as listRoute, POST as createRoute } from '@/app/api/provider-client-notes/route';
import { createProviderClientNote } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

function jsonRequest(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('API /api/provider-client-notes — Phase 25 Step 25.10', () => {
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

  describe('POST /', () => {
    it('201, если providerUserId=2 создаёт заметку про клиента 1 (есть booking на club 1)', async () => {
      // fixtureBookings: user=1 имеет booking'и на clubId=1 (managedByUserId=2).
      const response = await createRoute(
        jsonRequest('/api/provider-client-notes', 'POST', {
          providerUserId: 2,
          clientUserId: 1,
          note: 'Просил рекомендации по технике плавания',
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.providerUserId).toBe(2);
      expect(body.data.clientUserId).toBe(1);
      expect(body.data.note).toBe('Просил рекомендации по технике плавания');
      expect(typeof body.data.createdAt).toBe('string');
    });

    it('403, если provider не владеет ни одним клубом/тренером, на который есть booking клиента', async () => {
      // providerUserId=99 не является manager'ом ни club 1, ни trainer 1.
      const response = await createRoute(
        jsonRequest('/api/provider-client-notes', 'POST', {
          providerUserId: 99,
          clientUserId: 1,
          note: 'левая заметка',
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /', () => {
    it('фильтрует по providerUserId и clientUserId', async () => {
      await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'своя',
      });
      await createProviderClientNote({
        providerUserId: 99,
        clientUserId: 1,
        note: 'чужая',
      });

      const response = await listRoute(
        new NextRequest('http://localhost:3000/api/provider-client-notes?providerUserId=2'),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].note).toBe('своя');
    });
  });

  describe('PATCH /[id]', () => {
    it('обновляет note, если userId совпадает с providerUserId заметки', async () => {
      const note = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'старая',
      });
      // Гарантируем сдвиг updatedAt на >1 мс — иначе createTimestamp() даст ту же ISO-строку.
      await new Promise((resolve) => setTimeout(resolve, 5));

      const response = await patchRoute(
        jsonRequest(`/api/provider-client-notes/${note.id}`, 'PATCH', {
          userId: 2,
          note: 'новая',
        }),
        { params: Promise.resolve({ id: String(note.id) }) },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.note).toBe('новая');
      expect(body.data.updatedAt).not.toBe(note.updatedAt);
    });

    it('403, если userId не совпадает с providerUserId заметки', async () => {
      const note = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'чужая',
      });

      const response = await patchRoute(
        jsonRequest(`/api/provider-client-notes/${note.id}`, 'PATCH', {
          userId: 99,
          note: 'hack',
        }),
        { params: Promise.resolve({ id: String(note.id) }) },
      );

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /[id]', () => {
    it('удаляет заметку и возвращает 200 owner-у', async () => {
      const note = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'удалить',
      });

      const response = await deleteRoute(
        jsonRequest(`/api/provider-client-notes/${note.id}`, 'DELETE', { userId: 2 }),
        { params: Promise.resolve({ id: String(note.id) }) },
      );

      expect(response.status).toBe(200);
    });
  });
});
