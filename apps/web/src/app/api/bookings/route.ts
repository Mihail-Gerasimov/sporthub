// API записей: получение и создание booking.
// Phase 24 (Step 24.4): перед GET bookings вызываем runLazyBookingTransitions —
// pending-заявки за 1 час до слота авто-отменяются в cancelled_by_provider,
// confirmed через 48 часов после endAt переходят в unmarked. Идемпотентно.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createBookingAtomic,
  getBookings,
  getScheduleSlotContext,
  getUserById,
  runLazyBookingTransitions,
} from '@/lib/db';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';
import { isAthleteInQuarantine } from '@sporthub/domain';

const bookingsQuerySchema = z.object({
  userId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive()),
});

const createBookingSchema = z
  .object({
    scheduleId: z.number().int().positive(),
    userId: z.number().int().positive(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const validationResult = bookingsQuerySchema.safeParse({
      userId: request.nextUrl.searchParams.get('userId'),
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные параметры запроса',
        },
        { status: 400 },
      );
    }

    // Phase 24: триггерим ленивые автопереходы FSM перед чтением. Идемпотентно —
    // не создаёт лишних переходов при повторных вызовах.
    await runLazyBookingTransitions();

    const bookings = await getBookings();
    const userBookings = bookings
      .filter((booking) => booking.userId === validationResult.data.userId)
      .sort((left, right) => {
        const leftTimestamp = `${left.date}T${left.createdAt}`;
        const rightTimestamp = `${right.date}T${right.createdAt}`;

        return leftTimestamp.localeCompare(rightTimestamp);
      });

    return NextResponse.json({
      success: true,
      data: userBookings,
    });
  } catch (error) {
    console.error('Ошибка получения записей:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить записи пользователя',
      },
      { status: 500 },
    );
  }
}

// Phase 24: запись создаётся в pending, ждёт подтверждения провайдером
// (confirm/reject — Step 24.4 action-endpoints). Ленивый auto-cancel pending за 1 час
// до слота через runLazyBookingTransitions (Step 24.4).
export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = createBookingSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные данные записи',
        },
        { status: 400 },
      );
    }

    const { scheduleId, userId } = validationResult.data;

    // Проверяем пользователя и роль до atomic-записи
    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Пользователь не найден',
        },
        { status: 404 },
      );
    }

    if (user.role !== 'athlete') {
      return NextResponse.json(
        {
          success: false,
          error: 'Запись доступна только спортсмену',
        },
        { status: 403 },
      );
    }

    // Phase 24 Step 24.14: guard карантина — 403 если атлет в quarantine.
    // Клиент разбирает payload (error='quarantine', until=ISO) и показывает
    // соответствующее сообщение вместо generic-error.
    // Step 24.15: учитываем админское снятие карантина через user.quarantineLiftedAt.
    const allBookings = await getBookings();
    const quarantine = isAthleteInQuarantine(allBookings, userId, new Date(), {
      quarantineLiftedAt: user.quarantineLiftedAt ?? null,
    });
    if (quarantine.inQuarantine) {
      // Step 25.7: первый hit попытки записи из карантина триггерит quarantine_start.
      // Helper дедуплицирует через user.notifiedQuarantineUntil — если атлет уже был
      // уведомлён об этом окне, повторное уведомление не создастся.
      const { maybeNotifyQuarantineStart } = await import('@/lib/quarantine-notifier');
      await maybeNotifyQuarantineStart({ user, quarantine });

      return NextResponse.json(
        {
          success: false,
          error: 'quarantine',
          until: quarantine.until,
          reason: quarantine.reason,
        },
        { status: 403 },
      );
    }

    // Проверяем что parent-сущность не скрыта модератором
    const slotContext = await getScheduleSlotContext(scheduleId);

    if (slotContext) {
      const parentEntity = slotContext.club ?? slotContext.trainer;

      if (parentEntity?.status === 'hidden') {
        return NextResponse.json(
          {
            success: false,
            error: 'Публикация скрыта, запись невозможна',
          },
          { status: 403 },
        );
      }
    }

    const booking = await createBookingAtomic({ scheduleId, userId });

    // Логируем создание записи (fire-and-forget)
    logAction({
      action: 'booking_create',
      actorId: booking.userId,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: booking.id,
      meta: { scheduleId: booking.scheduleId, sportId: booking.sportId, date: booking.date },
    }).catch(() => {});

    // Phase 26 hotfix: уведомляем владельца слота (провайдера) о новой pending-заявке.
    // Без этого bell в шапке и страница /profile/provider/notifications не триггерились.
    // Ресолвим по ownerType: trainer-слот → managedByUserId тренера, club-слот → клуба.
    const providerUserId =
      booking.ownerType === 'trainer'
        ? (slotContext?.trainer?.managedByUserId ?? null)
        : (slotContext?.club?.managedByUserId ?? null);
    if (providerUserId !== null && providerUserId !== undefined) {
      await notify(providerUserId, 'booking_requested', {
        bookingId: booking.id,
        scheduleId: booking.scheduleId,
        athleteUserId: booking.userId,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: booking,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Ошибка создания записи:', error);

    // Маппинг бизнес-ошибок из db.ts на HTTP-коды
    const message = error instanceof Error ? error.message : '';

    if (message === 'Слот расписания не найден') {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }

    if (message === 'Пользователь уже записан на это занятие') {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    if (message === 'Свободных мест нет') {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось создать запись',
      },
      { status: 500 },
    );
  }
}
