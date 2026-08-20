// Контроллеры записей на тренировки.
//
// Семь маршрутов: чтение, создание, отмена, подтверждение, отказ, отметка исхода
// и физическое удаление администратором. Вся логика — в сервисе; здесь только
// разбор запроса, проверка прав и вызов.
//
// ⚠️ Личность приходит параметром от клиента, как и раньше. Это дыра, перенесённая
// сознательно: контракты обязаны совпасть, настоящая авторизация — отдельная фаза.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DISCIPLINE_CONFIG, getSlotEndAt, isAthleteInQuarantine } from '@sporthub/domain';
import type { Booking, BookingStatus } from '@sporthub/types';
import { BOOKING_STATUSES } from '@sporthub/types';
import { z } from 'zod';

import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  QuarantineError,
  ValidationError,
} from '../common/domain-error';
import { AccessService } from '../access/access.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import { SlotContextService } from '../schedule/slot-context.service';
import { BookingService } from './booking.service';
import { BookingsGateway } from './bookings.gateway';

const positiveId = z.number().int().positive();

const createSchema = z.object({ scheduleId: positiveId, userId: positiveId }).strict();
const actorSchema = z.object({ userId: positiveId }).strict();
const rejectSchema = z
  .object({ userId: positiveId, reason: z.string().trim().min(1).optional() })
  .strict();
const checkInSchema = z
  .object({ userId: positiveId, outcome: z.enum(['completed', 'no_show']) })
  .strict();
const adminSchema = z.object({ adminUserId: positiveId }).strict();

/** День занятия в параметрах отбора — та же строка `YYYY-MM-DD`, что и в записи. */
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Параметры выдачи записей.
 *
 * ⚠️ Все поля, кроме прежних `userId` и `scope`, НЕОБЯЗАТЕЛЬНЫЕ и добавлены этим
 * шагом: без них 14 страниц фронта тянули полный срез записей платформы, чтобы
 * показать записи одного человека или одного клуба. Необязательность здесь —
 * не вежливость, а условие: старый клиент обязан пережить выкатку, а `?scope=all`
 * обязан отвечать ровно тем же, чем отвечал.
 *
 * Схема НЕ строгая: неизвестные параметры прежний маршрут молча игнорировал,
 * и превращать их в отказ значило бы сломать уже работающие ссылки.
 */
const listQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  scope: z.string().optional(),
  clubId: z.coerce.number().int().positive().optional(),
  trainerId: z.coerce.number().int().positive().optional(),
  dateFrom: dateKey.optional(),
  dateTo: dateKey.optional(),
  // Набор статусов приходит перечислением через запятую: повторять параметр
  // умеют не все клиенты, а список словарный и проверяется по нему же.
  status: z
    .string()
    .transform((value) => value.split(',').map((item) => item.trim()))
    .refine(
      (values) =>
        values.length > 0 &&
        values.every((value) => BOOKING_STATUSES.includes(value as BookingStatus)),
      'Недопустимый статус записи',
    )
    .optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Разбор идентификатора записи с текстом, который отдавал прежний маршрут. */
function parseBookingId(raw: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректный id записи');
  }

  return parsed;
}

function parseBody<T>(schema: z.ZodType<T>, raw: unknown, message: string): T {
  const result = schema.safeParse(raw);

  if (!result.success) {
    throw new ValidationError(message);
  }

  return result.data;
}

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingService,
    private readonly gateway: BookingsGateway,
    private readonly access: AccessService,
    private readonly slotContext: SlotContextService,
    private readonly notifications: NotificationService,
    private readonly logs: LogService,
  ) {}

  /**
   * Выдача записей. Перед чтением отрабатывают автопереходы по времени.
   *
   * Два режима, как и раньше: записи одного атлета и полный срез по `?scope=all`
   * для страниц провайдера и админского раздела. Что изменилось — оба режима
   * теперь принимают отбор по клубу, тренеру, периоду и набору статусов плюс
   * постраничность, и всё это уходит в запрос к хранилищу, а не режется в памяти.
   */
  @Get()
  async findMany(@Query() rawQuery: Record<string, string>): Promise<Booking[]> {
    const parsed = listQuerySchema.safeParse(rawQuery);

    if (!parsed.success) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const { clubId, dateFrom, dateTo, limit, offset, scope, status, trainerId, userId } =
      parsed.data;

    // Полный срез — только по явному запросу. Во всех остальных случаях атлет
    // обязателен: иначе один забытый параметр отдал бы записи всей платформы.
    if (scope !== 'all' && userId === undefined) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    // Автопереходы прогоняются в обоих режимах — иначе выдача покажет протухшие статусы.
    await this.bookings.runLazyTransitions();

    return this.gateway.findMany({
      ...(userId === undefined ? {} : { userId }),
      ...(clubId === undefined ? {} : { clubId }),
      ...(trainerId === undefined ? {} : { trainerId }),
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
      ...(status === undefined ? {} : { status: status as BookingStatus[] }),
      ...(offset === undefined ? {} : { offset }),
      ...(limit === undefined ? {} : { limit }),
      // ⚠️ Порядок «мои записи» раньше наводился сортировкой уже ПОСЛЕ чтения всей
      // выдачи. С постраничностью так нельзя: порядок решает, какие строки вообще
      // попадут на страницу, — поэтому он уходит в запрос. Полный срез сохраняет
      // прежний порядок появления, на нём стоит эталон контрактов.
      order: userId === undefined ? 'id' : 'slotDate',
    });
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<Booking> {
    const { scheduleId, userId } = parseBody(createSchema, rawBody, 'Некорректные данные записи');

    const user = await this.gateway.findUser(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    if (user.role !== 'athlete') {
      throw new ForbiddenError('Запись доступна только спортсмену');
    }

    // Карантин отсекает запись до всех остальных проверок.
    const allBookings = await this.gateway.findAll();
    const quarantine = isAthleteInQuarantine(allBookings, userId, new Date(), {
      quarantineLiftedAt: user.quarantineLiftedAt ?? null,
    });

    if (quarantine.inQuarantine) {
      throw new QuarantineError(quarantine.until, quarantine.reason);
    }

    const context = await this.slotContext.getContext(scheduleId);
    const parent = context?.club ?? context?.trainer;

    if (parent?.status === 'hidden') {
      throw new ForbiddenError('Публикация скрыта, запись невозможна');
    }

    const booking = await this.bookings.create({ scheduleId, userId });

    await this.logs.record({
      action: 'booking_create',
      actorId: booking.userId,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: booking.id,
      meta: {
        scheduleId: booking.scheduleId,
        sportId: booking.sportId,
        date: booking.date,
      },
    });

    // Провайдеру — что появилась новая заявка.
    const providerUserId =
      booking.ownerType === 'trainer'
        ? (context?.trainer?.managedByUserId ?? null)
        : (context?.club?.managedByUserId ?? null);

    if (providerUserId !== null && providerUserId !== undefined) {
      await this.notifications.notify(providerUserId, 'booking_requested', {
        bookingId: booking.id,
        scheduleId: booking.scheduleId,
        athleteUserId: booking.userId,
      });
    }

    return booking;
  }

  /** Полная запись с историей. Доступно только администратору. */
  @Get(':id')
  async findOne(@Param('id') rawId: string, @Query('userId') rawUserId?: string): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const userId = Number(rawUserId);

    if (!rawUserId || !Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError('Некорректный userId');
    }

    if (!(await this.access.isAdmin(userId))) {
      throw new ForbiddenError('Недостаточно прав');
    }

    const booking = await this.gateway.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Запись не найдена');
    }

    return booking;
  }

  /** Отмена атлетом. Оставлена для совместимости с прежним фронтом. */
  @Delete(':id')
  async cancel(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<EmptyResult> {
    const bookingId = parseBookingId(rawId);
    const { userId } = parseBody(actorSchema, rawBody, 'Некорректные данные запроса');

    await this.bookings.cancelByAthlete({ bookingId, userId });

    await this.logs.record({
      action: 'booking_cancel',
      actorId: userId,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: bookingId,
      meta: { actor: 'athlete', source: 'public_delete' },
    });

    return EMPTY_RESULT;
  }

  /** Универсальная отмена: актор определяется по тому, кто запросил. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelByActor(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const { userId } = parseBody(actorSchema, rawBody, 'Некорректные данные запроса');
    const booking = await this.requireBooking(bookingId);

    const isAthlete = booking.userId === userId;
    const isProvider = !isAthlete && (await this.access.isProviderOfBooking(booking, userId));

    if (!isAthlete && !isProvider) {
      throw new ForbiddenError('Недостаточно прав для отмены записи');
    }

    const updated = await this.bookings.transition({
      bookingId,
      to: isAthlete ? 'cancelled_by_athlete' : 'cancelled_by_provider',
      actor: isAthlete ? 'athlete' : 'provider',
      actorUserId: userId,
    });

    await this.logs.record({
      action: 'booking_cancel',
      actorId: userId,
      actorRole: isAthlete ? 'athlete' : 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: {
        scheduleId: updated.scheduleId,
        actor: isAthlete ? 'athlete' : 'provider',
        cancelReason: updated.cancelReason,
      },
    });

    return updated;
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const { userId } = parseBody(actorSchema, rawBody, 'Некорректные данные запроса');
    const booking = await this.requireBooking(bookingId);

    await this.requireProvider(booking, userId, 'Недостаточно прав для подтверждения записи');

    const updated = await this.bookings.transition({
      bookingId,
      to: 'confirmed',
      actor: 'provider',
      actorUserId: userId,
    });

    await this.logs.record({
      action: 'booking_confirm',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: { scheduleId: updated.scheduleId, athleteId: updated.userId },
    });

    return updated;
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const { userId, reason } = parseBody(rejectSchema, rawBody, 'Некорректные данные запроса');
    const booking = await this.requireBooking(bookingId);

    await this.requireProvider(booking, userId, 'Недостаточно прав для отклонения записи');

    const updated = await this.bookings.transition({
      bookingId,
      to: 'rejected_by_provider',
      actor: 'provider',
      actorUserId: userId,
      reason,
    });

    await this.logs.record({
      action: 'booking_reject',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: {
        scheduleId: updated.scheduleId,
        athleteId: updated.userId,
        reason,
      },
    });

    return updated;
  }

  /** Отметка исхода. Доступна только после конца занятия и в течение 48 часов. */
  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const { userId, outcome } = parseBody(checkInSchema, rawBody, 'Некорректные данные запроса');
    const booking = await this.requireBooking(bookingId);

    await this.requireProvider(booking, userId, 'Недостаточно прав для check-in');

    const slot =
      booking.scheduleId === null ? null : await this.gateway.findSlot(booking.scheduleId);

    if (!slot) {
      throw new NotFoundError('Слот расписания не найден');
    }

    const now = new Date();
    const endAt = getSlotEndAt(slot);
    const windowCloses = new Date(
      endAt.getTime() + DISCIPLINE_CONFIG.checkIn.windowHoursAfterEnd * 60 * 60 * 1000,
    );

    if (now < endAt) {
      throw new ConflictError('Check-in доступен только после окончания слота');
    }

    if (now > windowCloses) {
      throw new ConflictError('Окно check-in истекло (48 часов после окончания слота)');
    }

    const updated = await this.bookings.transition({
      bookingId,
      to: outcome,
      actor: 'provider',
      actorUserId: userId,
      now,
    });

    await this.logs.record({
      action: outcome === 'completed' ? 'booking_check_in_completed' : 'booking_check_in_no_show',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: {
        scheduleId: updated.scheduleId,
        athleteId: updated.userId,
        outcome,
      },
    });

    return updated;
  }

  private async requireBooking(bookingId: number): Promise<Booking> {
    const booking = await this.gateway.findById(bookingId);

    if (!booking) {
      throw new NotFoundError('Запись не найдена');
    }

    return booking;
  }

  private async requireProvider(booking: Booking, userId: number, message: string): Promise<void> {
    if (!(await this.access.isProviderOfBooking(booking, userId))) {
      throw new ForbiddenError(message);
    }
  }
}

export const BOOKING_CONTROLLERS = [BookingsController];
