// Phase 24 Step 24.8: серверные guard-утилиты для API-роутов TrainerClubLink.
// isManagerOfTrainer/Club — проверка, что userId управляет соответствующей сущностью
// через поле managedByUserId. Используется в create/approve/reject/revoke endpoint'ах.
import 'server-only';

import { getClubById, getTrainerById } from '@/lib/db';
import type { EntityId } from '@sporthub/types';

/** Проверяет, что userId — manager тренера (trainer.managedByUserId === userId). */
export async function isManagerOfTrainer(trainerId: EntityId, userId: EntityId): Promise<boolean> {
  const trainer = await getTrainerById(trainerId);
  return trainer?.managedByUserId === userId;
}

/** Проверяет, что userId — manager клуба (club.managedByUserId === userId). */
export async function isManagerOfClub(clubId: EntityId, userId: EntityId): Promise<boolean> {
  const club = await getClubById(clubId);
  return club?.managedByUserId === userId;
}
