// CRM-заметки провайдера о клиентах.
//
// Заметку можно завести только про своего клиента: у человека должна быть хотя
// бы одна запись на клуб или тренера этого провайдера. Правит и удаляет заметку
// только её автор.
//
// Phase 34 Step 34.25: провайдер берётся ИЗ СЕССИИ и больше ниоткуда. До этого
// номер приезжал в теле и в строке запроса — и проверки владения, которые здесь
// были и остаются, сверяли ровно то, что клиент сам про себя сообщил. Дыра была
// самой тяжёлой на платформе: `?scope=all` отдавал анонимному гостю ВСЕ заметки
// всех провайдеров обо всех клиентах, а без него хватало подставить чужой номер
// в строку запроса, чтобы прочитать чужую переписку о людях.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { ProviderClientNote } from '@sporthub/types';
import { APP_LIMITS } from '@sporthub/types';
import { z } from 'zod';

import { AccessService } from '../access/access.service';
import { CurrentUser, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import type { ProviderClientNotesRepository } from '../repositories/crud.repository';
import { PROVIDER_CLIENT_NOTES_REPOSITORY } from '../repositories/crud.repository';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';

// ⚠️ Ни `providerUserId`, ни `userId` в схемах тела больше нет и быть не должно:
// автор заметки — это личность, а личность приходит из сессии. Поле, возвращённое
// сюда «для удобства фронта», вернёт и дыру целиком.
const createSchema = z
  .object({
    clientUserId: z.number().int().positive(),
    note: z.string().trim().min(1).max(APP_LIMITS.providerNoteMaxLength),
    bookingId: z.number().int().positive().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    note: z.string().trim().min(1).max(APP_LIMITS.providerNoteMaxLength).optional(),
    bookingId: z.number().int().positive().nullable().optional(),
  })
  .strict();

function parseNoteId(raw: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректный id');
  }

  return parsed;
}

// Весь раздел — работа провайдера со своими клиентами, и право у всех четырёх
// маршрутов одно. Пометка стоит на классе, а не на каждом методе: маршрут,
// добавленный сюда завтра, окажется под тем же правом сам.
@Requires('manage_own_clients')
@Controller('provider-client-notes')
export class ProviderClientNotesController {
  constructor(
    @Inject(PROVIDER_CLIENT_NOTES_REPOSITORY)
    private readonly notes: ProviderClientNotesRepository,
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    private readonly access: AccessService,
  ) {}

  /**
   * Заметки ТЕКУЩЕГО провайдера. Отбор по клиенту — необязательное сужение.
   *
   * Режим `?scope=all` убран совсем, а не закрыт правом администратора. Причины
   * две. Первая: после переноса личности в сессию умолчание отдаёт ровно то, ради
   * чего единственный потребитель (сводка клиентов в кабинете провайдера) звал
   * `scope=all`, — СВОИ заметки; закрывать правом было бы нечего. Вторая: срез
   * «все приватные заметки всех провайдеров» — это новая возможность, а не
   * сохранение старой, и заводить её без спроса, да ещё на самых чувствительных
   * данных площадки, не стоит. Понадобится админский разбор жалобы — маршрут
   * заведётся отдельно и под своим правом.
   *
   * Неизвестные параметры строки запроса (включая пришедший от старого клиента
   * `scope=all`) молча игнорируются: старая страница переживает выкатку и получает
   * свои заметки, а не отказ.
   */
  @Get()
  async findMany(
    @CurrentUser() session: SessionContext,
    @Query('clientUserId') rawClientUserId?: string,
  ): Promise<ProviderClientNote[]> {
    if (rawClientUserId !== undefined && !/^\d+$/.test(rawClientUserId)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    return this.notes.findMany({
      providerUserId: session.user.id,
      clientUserId: rawClientUserId === undefined ? undefined : Number(rawClientUserId),
    });
  }

  @Post()
  async create(
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<ProviderClientNote> {
    const parsed = createSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { clientUserId, note, bookingId } = parsed.data;
    // Автор заметки — тот, от чьего лица работают: под имперсонизацией админ ведёт
    // клиентов провайдера, и заметка обязана остаться заметкой провайдера.
    const providerUserId = session.user.id;

    // Клиент — тот, у кого есть хотя бы одна запись на публикацию провайдера.
    //
    // ⚠️ Раньше ради этой проверки поднимались ЦЕЛИКОМ три таблицы: все записи
    // платформы, все клубы и все тренеры. Теперь два точечных запроса: публикации
    // провайдера (по индексу владельца) и СЧЁТ записей клиента на них. Считает
    // база, а не длина массива, и ни одна строка записей не доезжает до приложения.
    //
    // Владения спрашиваются у `AccessService`, а не собираются здесь: тот же вопрос
    // задаёт срез записей клиентов (`GET /api/bookings?scope=clients`), и понимать
    // владение они обязаны ОДИНАКОВО — иначе заметку можно будет завести о человеке,
    // которого второй маршрут клиентом не считает.
    // ⚠️ Шаг 35.13, точка 9. Заметка о самом себе — не заметка о клиенте.
    // Записавшись на своё занятие (решение 16 это разрешает), человек формально
    // становится клиентом собственной публикации, и без этой проверки завёл бы
    // клиентскую карточку сам на себя.
    if (await this.access.isSelfDealing(providerUserId, { kind: 'client', clientUserId })) {
      throw new ForbiddenError('Нельзя завести клиентскую заметку о самом себе');
    }

    const owners = await this.access.getManagedPublicationIds(providerUserId);

    // Без владений клиентов быть не может — второй запрос не нужен вовсе.
    const isClient =
      owners.clubIds.length + owners.trainerIds.length > 0 &&
      (await this.bookings.count({ userId: clientUserId, owners })) > 0;

    if (!isClient) {
      throw new ForbiddenError('Этот пользователь не является вашим клиентом');
    }

    return this.notes.insert({ providerUserId, clientUserId, note, bookingId });
  }

  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<ProviderClientNote> {
    const noteId = parseNoteId(rawId);
    const parsed = patchSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    await this.requireOwn(noteId, session.user.id, 'редактирования');

    // `null` в поле записи снимает привязку, отсутствие поля её не трогает.
    const patch: { note?: string; bookingId?: number } = {};

    if (parsed.data.note !== undefined) {
      patch.note = parsed.data.note;
    }

    if (parsed.data.bookingId !== undefined) {
      patch.bookingId = parsed.data.bookingId ?? undefined;
    }

    return this.notes.update(noteId, patch);
  }

  // Тело здесь не читается вовсе: единственным, что в нём было, оставался номер
  // автора, а он теперь берётся из сессии.
  @Delete(':id')
  async remove(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const noteId = parseNoteId(rawId);

    await this.requireOwn(noteId, session.user.id, 'удаления');
    await this.notes.remove(noteId);

    return EMPTY_RESULT;
  }

  /** Заметка обязана существовать и принадлежать этому провайдеру. */
  private async requireOwn(
    noteId: number,
    userId: number,
    action: string,
  ): Promise<ProviderClientNote> {
    const existing = await this.notes.findById(noteId);

    if (!existing) {
      throw new NotFoundError('Заметка не найдена');
    }

    if (existing.providerUserId !== userId) {
      throw new ForbiddenError(`Недостаточно прав для ${action} заметки`);
    }

    return existing;
  }
}

export const NOTE_CONTROLLERS = [ProviderClientNotesController];
