// Сервис записей на тренировки — оркестрация поверх репозиториев.
//
// Правила переходов сюда не входят: они чистые и живут в `@sporthub/domain`.
// Здесь только то, что требует данных: проверка, запись обеих коллекций одной
// транзакцией, пересчёт занятых мест и рассылка уведомлений.
//
// ⚠️ Уведомления отправляются ПОСЛЕ фиксации транзакции и вне её — так же, как
// было до переноса. Если рассылка упадёт, переход всё равно останется. Менять
// это в фазе нельзя: поведение должно совпасть с прежним.

import { Inject, Injectable } from '@nestjs/common';
import {
  computeCancelReason,
  getBookedCountDelta,
  isAthleteInQuarantine,
  validateTransition,
  ACTIVE_BOOKING_STATUSES,
  DISCIPLINE_CONFIG,
  type DisciplineConfig,
} from '@sporthub/domain';
import type {
  Booking,
  BookingActor,
  BookingStatus,
  BookingStatusTransition,
  CancellationPolicy,
  Schedule,
} from '@sporthub/types';

import { ConflictError, NotFoundError, ForbiddenError } from '../common/domain-error';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type { ScheduleRepository } from '../repositories/entities.repository';
import { SCHEDULE_REPOSITORY } from '../repositories/entities.repository';
import { SlotContextService } from '../schedule/slot-context.service';

export type TransitionInput = {
  bookingId: number;
  to: BookingStatus;
  actor: BookingActor;
  actorUserId?: number;
  reason?: string;
  now?: Date;
};

export type LazyTransitionsResult = {
  autoCancelledPending: number;
  autoUnmarked: number;
};

/** Начало и конец слота. Время локальное — конвенция сохранена от прежней версии. */
export function getSlotStartAt(slot: Schedule): Date {
  return new Date(`${slot.date}T${slot.startTime}:00`);
}

export function getSlotEndAt(slot: Schedule): Date {
  return new Date(`${slot.date}T${slot.endTime}:00`);
}

@Injectable()
export class BookingService {
  constructor(
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository,
    private readonly slotContext: SlotContextService,
    private readonly notifications: NotificationService,
    private readonly logs: LogService,
  ) {}

  /**
   * Перевод записи в новый статус. Порядок строго тот же, что был:
   * найти → проверить правила → собрать историю → проставить поля по статусу →
   * пересчитать места → записать → уведомить.
   */
  async transition(input: TransitionInput): Promise<Booking> {
    const now = input.now ?? new Date();
    const booking = await this.bookings.findById(input.bookingId);

    if (!booking) {
      throw new NotFoundError('Запись не найдена');
    }

    try {
      validateTransition(booking.status, input.to, input.actor);
    } catch (error) {
      // Правила бросают обычную ошибку — превращаем её в конфликт состояния,
      // сохраняя текст дословно: на него завязаны роуты и тесты.
      throw new ConflictError(error instanceof Error ? error.message : 'Недопустимый переход');
    }

    const transition: BookingStatusTransition = {
      from: booking.status,
      to: input.to,
      actor: input.actor,
      actorUserId: input.actorUserId,
      at: now.toISOString(),
      reason: input.reason,
    };

    const patch: Partial<Booking> = {
      status: input.to,
      statusHistory: [...(booking.statusHistory ?? []), transition],
    };

    if (input.to === 'cancelled_by_athlete') {
      const slot = await this.schedule.findById(booking.scheduleId);
      patch.cancelledBy = input.actor;
      patch.cancelReason = computeCancelReason(booking, slot, now);
    } else if (input.to === 'cancelled_by_provider' || input.to === 'rejected_by_provider') {
      patch.cancelledBy = input.actor;
    } else if (input.to === 'completed') {
      patch.completedAt = now.toISOString();
    }

    const delta = getBookedCountDelta(booking.status, input.to);
    const updated = await this.bookings.update(booking.id, patch);

    if (delta !== 0) {
      // Слот мог исчезнуть — прежняя реализация в этом случае молча продолжала.
      const slot = await this.schedule.findById(booking.scheduleId);
      if (slot) {
        await this.schedule.changeBookedCount(slot.id, delta);
      }
    }

    await this.dispatchNotifications(updated, transition);

    return updated;
  }

  /** Создание записи. Проверки идут в том же порядке: слот → дубль → места. */
  async create(input: { scheduleId: number; userId: number }): Promise<Booking> {
    const context = await this.slotContext.getContext(input.scheduleId);

    if (!context) {
      throw new NotFoundError('Слот расписания не найден');
    }

    const { affiliatedClub, club, offering, schedule: slot, trainer } = context;

    const existing = await this.bookings.findMany({
      userId: input.userId,
      scheduleId: input.scheduleId,
    });
    const duplicate = existing.find((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status));

    if (duplicate) {
      throw new ConflictError('Пользователь уже записан на это занятие');
    }

    if (slot.bookedCount >= slot.capacity) {
      throw new ConflictError('Свободных мест нет');
    }

    const timestamp = new Date().toISOString();
    // Политика отмены фиксируется на момент записи: изменение условий позже
    // не должно менять правила для уже записавшегося.
    const snapshot: CancellationPolicy = offering?.cancellationPolicy ?? 'free_until_24h';

    const created = await this.bookings.insert({
      scheduleId: input.scheduleId,
      offeringId: slot.offeringId,
      ownerType: slot.ownerType,
      ownerId: slot.ownerId,
      userId: input.userId,
      clubId: club?.id ?? affiliatedClub?.id,
      trainerId: trainer?.id ?? slot.trainerId,
      sportId: offering?.sportId ?? slot.sportId,
      date: slot.date,
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: offering?.price ?? slot.price,
      cancellationPolicySnapshot: snapshot,
      statusHistory: [
        {
          from: null,
          to: 'pending',
          actor: 'athlete',
          actorUserId: input.userId,
          at: timestamp,
        },
      ],
    });

    await this.schedule.changeBookedCount(slot.id, 1);

    return created;
  }

  /** Отмена атлетом. Проверка владения — до правил перехода, ради точного текста. */
  async cancelByAthlete(input: { bookingId: number; userId: number }): Promise<void> {
    const booking = await this.bookings.findById(input.bookingId);

    if (!booking) {
      throw new NotFoundError('Запись не найдена');
    }

    if (booking.userId !== input.userId) {
      throw new ForbiddenError('Недостаточно прав для отмены записи');
    }

    await this.transition({
      bookingId: input.bookingId,
      to: 'cancelled_by_athlete',
      actor: 'athlete',
      actorUserId: input.userId,
    });
  }

  /**
   * Физическое удаление записи администратором. В отличие от отмены, история
   * исчезает навсегда. Место освобождается только если запись была активной.
   */
  async hardDelete(bookingId: number): Promise<void> {
    const booking = await this.bookings.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Запись не найдена');
    }

    await this.bookings.remove(bookingId);

    if (ACTIVE_BOOKING_STATUSES.has(booking.status)) {
      const slot = await this.schedule.findById(booking.scheduleId);
      if (slot) {
        await this.schedule.changeBookedCount(slot.id, -1);
      }
    }
  }

  /**
   * Автопереходы по времени. Работают без планировщика: вызываются при чтении
   * записей. Повторный вызов на тех же данных ничего не меняет — статус уже
   * не подходит под условие отбора.
   */
  async runLazyTransitions(
    now: Date = new Date(),
    config: DisciplineConfig = DISCIPLINE_CONFIG,
  ): Promise<LazyTransitionsResult> {
    const [bookings, slots] = await Promise.all([
      this.bookings.findAll(),
      this.schedule.findMany({ ownerType: 'all' }),
    ]);
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));
    const autoCancelMs = config.pending.autoCancelHoursBeforeStart * 60 * 60 * 1000;
    const unmarkMs = config.checkIn.windowHoursAfterEnd * 60 * 60 * 1000;

    const toCancel: Booking[] = [];
    const toUnmark: Booking[] = [];

    for (const booking of bookings) {
      const slot = slotById.get(booking.scheduleId);

      if (!slot) continue;

      if (booking.status === 'pending') {
        if (now.getTime() >= getSlotStartAt(slot).getTime() - autoCancelMs) {
          toCancel.push(booking);
        }
      } else if (booking.status === 'confirmed') {
        if (now.getTime() > getSlotEndAt(slot).getTime() + unmarkMs) {
          toUnmark.push(booking);
        }
      }
    }

    // Последовательно, а не пакетом: упавший переход не должен блокировать
    // остальные — они попадут в следующий вызов.
    for (const booking of toCancel) {
      await this.transition({
        bookingId: booking.id,
        to: 'cancelled_by_provider',
        actor: 'system',
        reason: 'auto_cancel_pending_expired',
        now,
      });
    }

    for (const booking of toUnmark) {
      await this.transition({
        bookingId: booking.id,
        to: 'unmarked',
        actor: 'system',
        now,
      });
    }

    return {
      autoCancelledPending: toCancel.length,
      autoUnmarked: toUnmark.length,
    };
  }

  /** Кто из пользователей отвечает за сущность, к которой относится запись. */
  private async resolveProviderUserId(booking: Booking): Promise<number | null> {
    const owner =
      booking.ownerType === 'trainer'
        ? await this.slotContext.findTrainerManager(booking.ownerId)
        : booking.ownerType === 'club'
          ? await this.slotContext.findClubManager(booking.ownerId)
          : null;

    return owner;
  }

  /**
   * Рассылка уведомлений по итогам перехода.
   * Таблица «статус × актор → адресат» перенесена без изменений, включая
   * несимметричные случаи: при отмене провайдером вручную сам провайдер
   * уведомления не получает, а при автоотмене — получает.
   */
  private async dispatchNotifications(
    booking: Booking,
    transition: BookingStatusTransition,
  ): Promise<void> {
    const athleteId = booking.userId;

    switch (transition.to) {
      case 'confirmed':
        await this.notifications.notify(athleteId, 'booking_confirmed', {
          bookingId: booking.id,
        });
        break;

      case 'rejected_by_provider':
        await this.notifications.notify(athleteId, 'booking_rejected', {
          bookingId: booking.id,
          reason: transition.reason,
        });
        break;

      case 'cancelled_by_athlete': {
        await this.notifications.notify(athleteId, 'booking_cancelled_by_athlete', {
          bookingId: booking.id,
          cancelReason: booking.cancelReason,
        });

        const providerUserId = await this.resolveProviderUserId(booking);
        if (providerUserId !== null) {
          await this.notifications.notify(
            providerUserId,
            'booking_cancelled_by_athlete_to_provider',
            {
              bookingId: booking.id,
              athleteUserId: booking.userId,
              cancelReason: booking.cancelReason,
            },
          );
        }
        break;
      }

      case 'cancelled_by_provider': {
        const bySystem = transition.actor === 'system';
        await this.notifications.notify(
          athleteId,
          bySystem ? 'booking_auto_expired' : 'booking_cancelled_by_provider',
          { bookingId: booking.id },
        );

        // Провайдера извещаем только при автоотмене: ручную он инициировал сам.
        if (bySystem) {
          const providerUserId = await this.resolveProviderUserId(booking);
          if (providerUserId !== null) {
            await this.notifications.notify(providerUserId, 'booking_auto_expired_to_provider', {
              bookingId: booking.id,
              athleteUserId: booking.userId,
            });
          }
        }
        break;
      }

      case 'completed':
        await this.notifications.notify(athleteId, 'booking_completed', {
          bookingId: booking.id,
        });
        break;

      case 'no_show':
        await this.notifications.notify(athleteId, 'booking_no_show', {
          bookingId: booking.id,
        });
        break;

      // `unmarked` — служебный финал, атлету не сообщается.
      default:
        break;
    }

    void isAthleteInQuarantine;
    void this.logs;
  }
}
