/**
 * Тесты CRUD-функций ProviderClientNote (Phase 25 — Step 25.10).
 * createProviderClientNote / getProviderClientNotes (фильтры) / getProviderClientNoteById /
 * updateProviderClientNote / deleteProviderClientNote.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createProviderClientNote,
  deleteProviderClientNote,
  getProviderClientNoteById,
  getProviderClientNotes,
  updateProviderClientNote,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('db ProviderClientNote CRUD — Phase 25', () => {
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

  describe('createProviderClientNote', () => {
    it('создаёт заметку с автоматическим id, createdAt, updatedAt', async () => {
      const note = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Просил персональные рекомендации по технике.',
      });

      expect(note.id).toBe(1);
      expect(note.createdAt).toBeDefined();
      expect(note.updatedAt).toBe(note.createdAt);
      expect(note.providerUserId).toBe(2);
      expect(note.clientUserId).toBe(1);
      expect(note.note).toBe('Просил персональные рекомендации по технике.');
      expect(note.bookingId).toBeUndefined();
    });

    it('сохраняет опциональный bookingId и назначает последовательные id', async () => {
      await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Первая заметка',
      });
      const second = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Привязана к брони',
        bookingId: 3,
      });

      expect(second.id).toBe(2);
      expect(second.bookingId).toBe(3);
    });
  });

  describe('getProviderClientNotes', () => {
    beforeEach(async () => {
      await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'A: клиент 1',
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 5,
        note: 'B: клиент 5',
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await createProviderClientNote({
        providerUserId: 99,
        clientUserId: 1,
        note: 'C: другой провайдер',
      });
    });

    it('фильтрует по providerUserId (DESC по createdAt) и игнорирует чужих', async () => {
      const notes = await getProviderClientNotes({ providerUserId: 2 });

      expect(notes).toHaveLength(2);
      // DESC: последняя созданная (B) — первой.
      expect(notes[0].note).toBe('B: клиент 5');
      expect(notes[1].note).toBe('A: клиент 1');
      expect(notes.every((n) => n.providerUserId === 2)).toBe(true);
    });

    it('комбинирует providerUserId и clientUserId', async () => {
      const notes = await getProviderClientNotes({ providerUserId: 2, clientUserId: 1 });

      expect(notes).toHaveLength(1);
      expect(notes[0].note).toBe('A: клиент 1');
    });
  });

  describe('getProviderClientNoteById', () => {
    it('возвращает заметку по id или null', async () => {
      const created = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Одна',
      });

      const found = await getProviderClientNoteById(created.id);
      const missing = await getProviderClientNoteById(999);

      expect(found?.id).toBe(created.id);
      expect(missing).toBeNull();
    });
  });

  describe('updateProviderClientNote', () => {
    it('обновляет note + bookingId и двигает updatedAt', async () => {
      const created = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Старая',
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const updated = await updateProviderClientNote(created.id, {
        note: 'Новая',
        bookingId: 7,
      });

      expect(updated.note).toBe('Новая');
      expect(updated.bookingId).toBe(7);
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).not.toBe(created.updatedAt);
    });

    it('бросает ошибку для несуществующего id', async () => {
      await expect(updateProviderClientNote(999, { note: 'x' })).rejects.toThrow(
        'Заметка провайдера не найдена',
      );
    });
  });

  describe('deleteProviderClientNote', () => {
    it('удаляет заметку и после этого getProviderClientNoteById возвращает null', async () => {
      const created = await createProviderClientNote({
        providerUserId: 2,
        clientUserId: 1,
        note: 'Удалить меня',
      });

      await deleteProviderClientNote(created.id);

      expect(await getProviderClientNoteById(created.id)).toBeNull();
    });
  });
});
