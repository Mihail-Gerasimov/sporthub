// CRM-заметки провайдера о клиентах.
//
// Заметку можно завести только про своего клиента: у человека должна быть хотя
// бы одна запись на клуб или тренера этого провайдера. Правит и удаляет заметку
// только её автор.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { ProviderClientNote } from '@sporthub/types';
import { APP_LIMITS } from '@sporthub/types';
import { z } from 'zod';

import { AccessService } from '../access/access.service';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import type { ProviderClientNotesRepository } from '../repositories/crud.repository';
import { PROVIDER_CLIENT_NOTES_REPOSITORY } from '../repositories/crud.repository';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';

const createSchema = z
  .object({
    providerUserId: z.number().int().positive(),
    clientUserId: z.number().int().positive(),
    note: z.string().trim().min(1).max(APP_LIMITS.providerNoteMaxLength),
    bookingId: z.number().int().positive().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    userId: z.number().int().positive(),
    note: z.string().trim().min(1).max(APP_LIMITS.providerNoteMaxLength).optional(),
    bookingId: z.number().int().positive().nullable().optional(),
  })
  .strict();

const deleteSchema = z.object({ userId: z.number().int().positive() }).strict();

function parseNoteId(raw: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректный id');
  }

  return parsed;
}

@Controller('provider-client-notes')
export class ProviderClientNotesController {
  constructor(
    @Inject(PROVIDER_CLIENT_NOTES_REPOSITORY)
    private readonly notes: ProviderClientNotesRepository,
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    private readonly access: AccessService,
  ) {}

  @Get()
  async findMany(
    @Query('providerUserId') rawProviderUserId?: string,
    @Query('clientUserId') rawClientUserId?: string,
    @Query('scope') scope?: string,
  ): Promise<ProviderClientNote[]> {
    // Страница клиентов провайдера отбирает заметки уже у себя, поэтому ей
    // нужен полный срез. Умолчание прежнее — только заметки одного провайдера.
    if (scope === 'all') {
      return this.notes.findAll();
    }

    if (rawProviderUserId === undefined || !/^\d+$/.test(rawProviderUserId)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    if (rawClientUserId !== undefined && !/^\d+$/.test(rawClientUserId)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    return this.notes.findMany({
      providerUserId: Number(rawProviderUserId),
      clientUserId: rawClientUserId === undefined ? undefined : Number(rawClientUserId),
    });
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<ProviderClientNote> {
    const parsed = createSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { providerUserId, clientUserId, note, bookingId } = parsed.data;

    // Клиент — тот, у кого есть хотя бы одна запись на публикацию провайдера.
    //
    // ⚠️ Раньше ради этой проверки поднимались ЦЕЛИКОМ три таблицы: все записи
    // платформы, все клубы и все тренеры. Теперь два точечных запроса: публикации
    // провайдера (по индексу владельца) и СЧЁТ записей клиента на них. Считает
    // база, а не длина массива, и ни одна строка записей не доезжает до приложения.
    const [clubs, trainers] = await Promise.all([
      this.clubs.findAll({ managedByUserId: providerUserId }),
      this.trainers.findAll({ managedByUserId: providerUserId }),
    ]);

    // Без владений клиентов быть не может — второй запрос не нужен вовсе.
    const owners = {
      clubIds: clubs.map((club) => club.id),
      trainerIds: trainers.map((trainer) => trainer.id),
    };
    const isClient =
      owners.clubIds.length + owners.trainerIds.length > 0 &&
      (await this.bookings.count({ userId: clientUserId, owners })) > 0;

    if (!isClient) {
      throw new ForbiddenError('Этот пользователь не является вашим клиентом');
    }

    return this.notes.insert({ providerUserId, clientUserId, note, bookingId });
  }

  @Patch(':id')
  async update(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<ProviderClientNote> {
    const noteId = parseNoteId(rawId);
    const parsed = patchSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const existing = await this.requireOwn(noteId, parsed.data.userId, 'редактирования');

    // `null` в поле записи снимает привязку, отсутствие поля её не трогает.
    const patch: { note?: string; bookingId?: number } = {};

    if (parsed.data.note !== undefined) {
      patch.note = parsed.data.note;
    }

    if (parsed.data.bookingId !== undefined) {
      patch.bookingId = parsed.data.bookingId ?? undefined;
    }

    void existing;

    return this.notes.update(noteId, patch);
  }

  @Delete(':id')
  async remove(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<EmptyResult> {
    const noteId = parseNoteId(rawId);
    const parsed = deleteSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    await this.requireOwn(noteId, parsed.data.userId, 'удаления');
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
