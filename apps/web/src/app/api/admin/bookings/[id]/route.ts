// Phase 24 Step 24.4: DELETE /api/admin/bookings/[id] — admin-only hard-delete
// booking'а. В отличие от публичного DELETE /api/bookings/[id] (soft-cancel через FSM),
// здесь запись физически удаляется из bookings.json вместе со statusHistory.
// Откатывает bookedCount только для ACTIVE-статусов. Используется в админских
// инструментах (Step 24.15) для полного выноса некорректных/тестовых записей.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { hardDeleteBooking } from '@/lib/db';
import { isAdminUser } from '@/lib/booking-guards';
import { logAction } from '@/lib/logAction';

const deleteSchema = z
  .object({
    adminUserId: z.number().int().positive(),
  })
  .strict();

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bookingId = Number(id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id записи' },
        { status: 400 },
      );
    }

    const raw = await request.json();
    const validation = deleteSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { adminUserId } = validation.data;

    // Server-side guard: подтверждаем admin-роль по users.json. Клиентский state
    // не trusted — admin-endpoint должен проверять независимо.
    const isAdmin = await isAdminUser(adminUserId);

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Действие доступно только администратору' },
        { status: 403 },
      );
    }

    await hardDeleteBooking({ bookingId, adminUserId });

    logAction({
      action: 'admin_hard_delete_booking',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'booking',
      entityId: bookingId,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'Запись не найдена') {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }

    console.error('Ошибка admin-удаления записи:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось удалить запись' },
      { status: 500 },
    );
  }
}
