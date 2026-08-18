// Phase 24 Step 24.4: серверные guard-утилиты для API-роутов FSM-переходов booking'а.
// isProviderOfBooking — проверяет, управляет ли пользователь parent-сущностью
// (clubId.managedByUserId или trainerId.managedByUserId). Используется в confirm/reject/
// check-in/cancel(by provider) endpoint'ах.
// isAdminUser — проверяет admin-роль; используется в DELETE /api/admin/bookings/[id].

import 'server-only';

import { getClubById, getTrainerById, getUserById } from '@/lib/db';
import type { Booking, EntityId } from '@sporthub/types';

/**
 * Проверяет, является ли пользователь провайдером booking'а — владельцем клуба
 * или тренера, к которому относится эта запись. Учитывает оба поля `clubId`/`trainerId`
 * в Booking и fallback через `ownerType`/`ownerId` (для старого формата).
 */
export async function isProviderOfBooking(booking: Booking, userId: EntityId): Promise<boolean> {
  const clubId = booking.clubId ?? (booking.ownerType === 'club' ? booking.ownerId : undefined);
  const trainerId =
    booking.trainerId ?? (booking.ownerType === 'trainer' ? booking.ownerId : undefined);

  if (clubId !== undefined) {
    const club = await getClubById(clubId);

    if (club?.managedByUserId === userId) {
      return true;
    }
  }

  if (trainerId !== undefined) {
    const trainer = await getTrainerById(trainerId);

    if (trainer?.managedByUserId === userId) {
      return true;
    }
  }

  return false;
}

/**
 * Проверяет, что пользователь имеет роль 'admin' в users.json. Server-side guard
 * для DELETE /api/admin/bookings/[id] и других админских инструментов Phase 24.
 */
export async function isAdminUser(userId: EntityId): Promise<boolean> {
  const user = await getUserById(userId);
  return user?.role === 'admin';
}
