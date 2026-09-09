// Контроллеры записей на тренировки.
//
// Восемь маршрутов: выдача, создание, чтение записи целиком, отмена атлетом,
// универсальная отмена, подтверждение, отказ и отметка исхода. Вся логика — в
// сервисе; здесь только разбор запроса, проверка прав и вызов.
//
// Личность вызывающего приходит ТОЛЬКО из сессии. До фазы 34 её присылал сам
// клиент — номером в теле или в строке запроса, — то есть действовать от чужого
// имени мог кто угодно. Теперь этот номер не читается вовсе: схемы разбора его
// не знают, а прежний клиент, который его ещё шлёт, не влияет ни на что.

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
import { DISCIPLINE_CONFIG, getSlotEndAt, isAthleteInQuarantine, roleCan } from '@sporthub/domain';
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
import { CurrentUser, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import { SlotContextService } from '../schedule/slot-context.service';
import { BookingService } from './booking.service';
import { BookingsGateway } from './bookings.gateway';

const positiveId = z.number().int().positive();

/**
 * Тела запросов. Ни одно из них больше не содержит личность вызывающего.
 *
 * ⚠️ Строгость (`.strict()`) снята сознательно. Прежний клиент шлёт вместе с делом
 * ещё и `userId`, и строгая схема отвечала бы ему 400 — а нужно ровно обратное:
 * лишнее поле обязано молча отбрасываться, чтобы подстановка чужого номера
 * не значила НИЧЕГО. Отказ вместо тишины превратил бы закрытую дыру в поломку
 * работающих экранов.
 */
const createSchema = z.object({ scheduleId: positiveId });
const rejectSchema = z.object({ reason: z.string().trim().min(1).optional() });
const checkInSchema = z.object({ outcome: z.enum(['completed', 'no_show']) });

/** День занятия в параметрах отбора — та же строка `YYYY-MM-DD`, что и в записи. */
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Параметры выдачи записей.
 *
 * Все поля, кроме `scope`, НЕОБЯЗАТЕЛЬНЫЕ: без них 14 страниц фронта тянули полный
 * срез записей платформы, чтобы показать записи одного человека или одного клуба.
 * Необязательность здесь — не вежливость, а условие: старый клиент обязан пережить
 * выкатку.
 *
 * ⚠️ Прежнего `userId` в схеме НЕТ: чьи записи отдавать, решает сессия, а не строка
 * запроса. Схема НЕ строгая, поэтому оставшийся у старого клиента `?userId=…`
 * просто игнорируется — как игнорировался любой неизвестный параметр.
 */
const listQuerySchema = z.object({
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
   * Обычный режим отдаёт записи ТОГО, КТО СПРАШИВАЕТ, — номер берётся из сессии,
   * и попросить чужие больше нечем. Полный срез платформы остаётся за `?scope=all`,
   * но уходит под право `use_admin_tools`: до этого шага он отдавал кому угодно
   * чужие записи вместе с ценами, телефонами клубов и историей статусов.
   *
   * Оба режима принимают отбор по клубу, тренеру, периоду и набору статусов плюс
   * постраничность, и всё это уходит в запрос к хранилищу, а не режется в памяти.
   */
  @Get()
  async findMany(
    @Query() rawQuery: Record<string, string>,
    @CurrentUser() session: SessionContext,
  ): Promise<Booking[]> {
    const parsed = listQuerySchema.safeParse(rawQuery);

    if (!parsed.success) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const { clubId, dateFrom, dateTo, limit, offset, scope, status, trainerId } = parsed.data;
    const wantsPlatformWide = scope === 'all';

    // ⚠️ Право спрашивается здесь, а не декоратором `@Requires`, и это вынужденно:
    // режим включается параметром запроса, а декоратор закрывает маршрут целиком.
    // Закрыть им весь маршрут значило бы отобрать у человека его же записи.
    if (wantsPlatformWide && !roleCan(session.user.role, 'use_admin_tools')) {
      throw new ForbiddenError('Недостаточно прав');
    }

    // Автопереходы прогоняются в обоих режимах — иначе выдача покажет протухшие статусы.
    await this.bookings.runLazyTransitions();

    return this.gateway.findMany({
      // Полный срез не сужается по человеку; во всех остальных случаях сужение
      // по владельцу сессии обязательно и снять его снаружи нечем.
      ...(wantsPlatformWide ? {} : { userId: session.user.id }),
      ...(clubId === undefined ? {} : { clubId }),
      ...(trainerId === undefined ? {} : { trainerId }),
      ...(dateFrom === undefined ? {} : { dateFrom }),
      ...(dateTo === undefined ? {} : { dateTo }),
      ...(status === undefined ? {} : { status: status as BookingStatus[] }),
      ...(offset === undefined ? {} : { offset }),
      ...(limit === undefined ? {} : { limit }),
      // ⚠️ Порядок «моих записей» раньше наводился сортировкой уже ПОСЛЕ чтения всей
      // выдачи. С постраничностью так нельзя: порядок решает, какие строки вообще
      // попадут на страницу, — поэтому он уходит в запрос. Полный срез сохраняет
      // прежний порядок появления, на нём стоит эталон контрактов.
      order: wantsPlatformWide ? 'id' : 'slotDate',
    });
  }

  @Post()
  async create(@Body() rawBody: unknown, @CurrentUser() session: SessionContext): Promise<Booking> {
    const { scheduleId } = parseBody(createSchema, rawBody, 'Некорректные данные записи');
    // Записывается тот, ОТ ЧЬЕГО ЛИЦА действуют: под имперсонизацией запись
    // принадлежит цели, а не администратору. Отдельного чтения пользователя больше
    // нет — guard уже загрузил его, проверив сессию.
    const user = session.user;
    const userId = user.id;

    // Роль по имени больше не проверяется — спрашиваем ПРАВО. Текст ответа оставлен
    // дословно: он закреплён сторожем текстов и разбирается фронтом.
    if (!roleCan(user.role, 'book_sessions')) {
      throw new ForbiddenError('Запись доступна только спортсмену');
    }

    // Карантин отсекает запись до всех остальных проверок.
    //
    // ⚠️ Читаются записи ТОЛЬКО этого человека и только двух статусов. Раньше здесь
    // поднималась вся таблица записей платформы: расчёт всё равно отбрасывал чужие
    // и все прочие статусы внутри себя, то есть 99% поднятого выбрасывалось сразу.
    // Отбор перенесён в запрос — результат тот же, потому что условие дословно
    // повторяет то, по которому фильтрует сам расчёт.
    const athleteHistory = await this.gateway.findMany({
      userId,
      status: ['completed', 'no_show'],
    });
    const quarantine = isAthleteInQuarantine(athleteHistory, userId, new Date(), {
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
      // Исполнитель — тот, кто ВОШЁЛ. Под имперсонизацией запись принадлежит цели,
      // а в журнале обязан остаться след администратора: иначе действие теряет автора.
      actorId: session.actor.id,
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

  /**
   * Полная запись с историей — служебное чтение админского раздела.
   *
   * Прежде маршрут спрашивал «а этот номер принадлежит администратору?» у номера,
   * присланного самим клиентом. Теперь право проверяет guard, и подставлять нечего.
   */
  @Requires('use_admin_tools')
  @Get(':id')
  async findOne(@Param('id') rawId: string): Promise<Booking> {
    const bookingId = parseBookingId(rawId);

    return this.requireBooking(bookingId);
  }

  /** Отмена атлетом. Оставлена для совместимости с прежним фронтом. */
  @Delete(':id')
  async cancel(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const bookingId = parseBookingId(rawId);
    const userId = session.user.id;

    // Владение проверяет сервис — чужую запись он не отменит. Изменился только
    // источник номера: сессия вместо тела запроса.
    await this.bookings.cancelByAthlete({ bookingId, userId });

    await this.logs.record({
      action: 'booking_cancel',
      actorId: session.actor.id,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: bookingId,
      meta: { actor: 'athlete', source: 'public_delete' },
    });

    return EMPTY_RESULT;
  }

  /** Универсальная отмена: актор определяется по тому, кто вошёл. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelByActor(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const userId = session.user.id;
    const booking = await this.requireBooking(bookingId);

    const isAthlete = booking.userId === userId;
    const isProvider = !isAthlete && (await this.access.isProviderOfBooking(booking, userId));

    // Проверка владения остаётся прежней: посторонний не отменит ни как атлет,
    // ни как провайдер, потому что не является ни тем, ни другим для этой записи.
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
      actorId: session.actor.id,
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
  async confirm(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const userId = session.user.id;
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
      actorId: session.actor.id,
      actorRole: 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: { scheduleId: updated.scheduleId, athleteId: updated.userId },
    });

    return updated;
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const { reason } = parseBody(rejectSchema, rawBody, 'Некорректные данные запроса');
    const userId = session.user.id;
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
      actorId: session.actor.id,
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
  async checkIn(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<Booking> {
    const bookingId = parseBookingId(rawId);
    const { outcome } = parseBody(checkInSchema, rawBody, 'Некорректные данные запроса');
    const userId = session.user.id;
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
      actorId: session.actor.id,
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
