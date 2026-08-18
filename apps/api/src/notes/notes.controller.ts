// CRM-заметки провайдера о клиентах.
//
// Заметку можно завести только про своего клиента: у человека должна быть хотя
// бы одна запись на клуб или тренера этого провайдера. Правит и удаляет заметку
// только её автор.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { ProviderClientNote } from '@sporthub/types';
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
    note: z.string().trim().min(1).max(2000),
    bookingId: z.number().int().positive().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    userId: z.number().int().positive(),
    note: z.string().trim().min(1).max(2000).optional(),
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
  ): Promise<ProviderClientNote[]> {
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
    // Клиент — тот, у кого есть хотя бы одна запись на сущность провайдера.
    const [bookings, clubs, trainers] = await Promise.all([
      this.bookings.findAll(),
      this.clubs.findAll(),
      this.trainers.findAll(),
    ]);
    const isClient = this.access.isClientOfProvider(
      clientUserId,
      providerUserId,
      bookings,
      clubs,
      trainers,
    );

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
