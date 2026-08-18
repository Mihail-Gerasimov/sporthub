/**
 * Тесты CRUD-функций для TrainerClubLink (Phase 24 — Step 24.2).
 * createTrainerClubLink / getTrainerClubLinks (фильтры) / getTrainerClubLinkById /
 * updateTrainerClubLink (approve/reject/revoke сценарии).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTrainerClubLink,
  getTrainerClubLinkById,
  getTrainerClubLinks,
  updateTrainerClubLink,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('db TrainerClubLink CRUD — Phase 24', () => {
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

  describe('createTrainerClubLink', () => {
    it('создаёт pending link с автоматическим id и createdAt', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      expect(link.id).toBe(1);
      expect(link.createdAt).toBeDefined();
      expect(link.trainerId).toBe(1);
      expect(link.clubId).toBe(2);
      expect(link.status).toBe('pending');
      expect(link.initiatedBy).toBe('trainer');
    });

    it('назначает последовательные id', async () => {
      await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'pending',
        initiatedBy: 'trainer',
      });
      const second = await createTrainerClubLink({
        trainerId: 3,
        clubId: 2,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      expect(second.id).toBe(2);
    });
  });

  describe('getTrainerClubLinks', () => {
    beforeEach(async () => {
      await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'pending',
        initiatedBy: 'trainer',
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await createTrainerClubLink({
        trainerId: 3,
        clubId: 2,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });
      await new Promise((resolve) => setTimeout(resolve, 2));
      await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'rejected',
        initiatedBy: 'trainer',
      });
    });

    it('возвращает все ссылки без фильтров, отсортированные по createdAt DESC', async () => {
      const all = await getTrainerClubLinks();

      expect(all).toHaveLength(3);
      // DESC — последняя созданная (rejected) первой
      expect(all[0].status).toBe('rejected');
    });

    it('фильтрует по trainerId', async () => {
      const forTrainer1 = await getTrainerClubLinks({ trainerId: 1 });

      expect(forTrainer1).toHaveLength(2);
      expect(forTrainer1.every((link) => link.trainerId === 1)).toBe(true);
    });

    it('фильтрует по clubId', async () => {
      const forClub2 = await getTrainerClubLinks({ clubId: 2 });

      expect(forClub2).toHaveLength(2);
      expect(forClub2.every((link) => link.clubId === 2)).toBe(true);
    });

    it('фильтрует по status', async () => {
      const pending = await getTrainerClubLinks({ status: 'pending' });
      const confirmed = await getTrainerClubLinks({ status: 'confirmed' });

      expect(pending).toHaveLength(1);
      expect(confirmed).toHaveLength(1);
      expect(pending[0].status).toBe('pending');
      expect(confirmed[0].status).toBe('confirmed');
    });

    it('комбинирует фильтры: trainerId + status confirmed = одна запись', async () => {
      const result = await getTrainerClubLinks({ trainerId: 3, status: 'confirmed' });

      expect(result).toHaveLength(1);
      expect(result[0].trainerId).toBe(3);
      expect(result[0].status).toBe('confirmed');
    });
  });

  describe('getTrainerClubLinkById', () => {
    it('возвращает link по id', async () => {
      const created = await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const found = await getTrainerClubLinkById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('возвращает null для несуществующего id', async () => {
      const found = await getTrainerClubLinkById(999);

      expect(found).toBeNull();
    });
  });

  describe('updateTrainerClubLink', () => {
    it('approve: pending → confirmed с approvedAt и approvedByUserId', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const updated = await updateTrainerClubLink(link.id, {
        status: 'confirmed',
        approvedAt: new Date().toISOString(),
        approvedByUserId: 2,
      });

      expect(updated.status).toBe('confirmed');
      expect(updated.approvedAt).toBeDefined();
      expect(updated.approvedByUserId).toBe(2);
      // Исходные поля сохраняются
      expect(updated.trainerId).toBe(1);
      expect(updated.clubId).toBe(2);
    });

    it('reject: pending → rejected с rejectionReason', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const updated = await updateTrainerClubLink(link.id, {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        rejectedByUserId: 2,
        rejectionReason: 'Все тренерские слоты заняты',
      });

      expect(updated.status).toBe('rejected');
      expect(updated.rejectionReason).toBe('Все тренерские слоты заняты');
    });

    it('revoke: confirmed → revoked с revokedBy', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });

      const updated = await updateTrainerClubLink(link.id, {
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        revokedByUserId: 2,
        revokedBy: 'club',
      });

      expect(updated.status).toBe('revoked');
      expect(updated.revokedBy).toBe('club');
    });

    it('бросает ошибку для несуществующего id', async () => {
      await expect(updateTrainerClubLink(999, { status: 'confirmed' })).rejects.toThrow(
        'Привязка тренер↔клуб не найдена',
      );
    });
  });
});
