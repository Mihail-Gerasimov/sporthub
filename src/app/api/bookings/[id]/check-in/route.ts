// Phase 24 Step 24.4: POST /api/bookings/[id]/check-in — провайдер отмечает
// исход confirmed-записи после окончания слота: outcome='completed' | 'no_show'.
// Guards: userId — провайдер parent-сущности; booking.status === 'confirmed';
// окно времени: endAt <= now <= endAt + DISCIPLINE_CONFIG.checkIn.windowHoursAfterEnd.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { DISCIPLINE_CONFIG } from '@/lib/discipline-config';
import { getBookings, getSchedule, transitionBooking } from '@/lib/db';
import { isProviderOfBooking } from '@/lib/booking-guards';
import { logAction } from '@/lib/logAction';

const checkInSchema = z
  .object({
    userId: z.number().int().positive(),
    outcome: z.enum(['completed', 'no_show']),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const validation = checkInSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId, outcome } = validation.data;

    const bookings = await getBookings();
    const booking = bookings.find((candidate) => candidate.id === bookingId);

    if (!booking) {
      return NextResponse.json({ success: false, error: 'Запись не найдена' }, { status: 404 });
    }

    const isOwner = await isProviderOfBooking(booking, userId);

    if (!isOwner) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для check-in' },
        { status: 403 },
      );
    }

    // Окно check-in: после окончания слота и в пределах 48 часов.
    const schedule = await getSchedule({ ownerType: 'all' });
    const slot = schedule.find((candidate) => candidate.id === booking.scheduleId);

    if (!slot) {
      return NextResponse.json(
        { success: false, error: 'Слот расписания не найден' },
        { status: 404 },
      );
    }

    const now = new Date();
    const endAt = new Date(`${slot.date}T${slot.endTime}:00`);
    const windowCloses = new Date(
      endAt.getTime() + DISCIPLINE_CONFIG.checkIn.windowHoursAfterEnd * 60 * 60 * 1000,
    );

    if (now < endAt) {
      return NextResponse.json(
        { success: false, error: 'Check-in доступен только после окончания слота' },
        { status: 409 },
      );
    }

    if (now > windowCloses) {
      return NextResponse.json(
        { success: false, error: 'Окно check-in истекло (48 часов после окончания слота)' },
        { status: 409 },
      );
    }

    const updated = await transitionBooking({
      bookingId,
      to: outcome,
      actor: 'provider',
      actorUserId: userId,
      now,
    });

    logAction({
      action: outcome === 'completed' ? 'booking_check_in_completed' : 'booking_check_in_no_show',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: { scheduleId: updated.scheduleId, athleteId: updated.userId, outcome },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message.startsWith('Недопустимый переход') || message.startsWith('Actor ')) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    console.error('Ошибка check-in:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось выполнить check-in' },
      { status: 500 },
    );
  }
}
