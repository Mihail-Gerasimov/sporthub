// Контроллеры связей тренер↔клуб.
//
// Роль в журнале записывается по стороне, принявшей решение: клуб пишется как
// `club_owner`, тренер — как `trainer`. Разрыв администратором пишется как
// `admin`, обычный разрыв — всегда как `club_owner`, даже когда его сделал
// тренер. Последнее выглядит ошибкой, но так писалось раньше и на этом стоят
// выборки журнала, поэтому сохранено.

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type { TrainerClubLink, TrainerClubLinkStatus } from '@sporthub/types';
import { z } from 'zod';

import { ValidationError } from '../common/domain-error';
import { LogService } from '../logs/log.service';
import { LinkService } from './link.service';

const createSchema = z
  .object({
    trainerId: z.number().int().positive(),
    clubId: z.number().int().positive(),
    userId: z.number().int().positive(),
    initiatedBy: z.enum(['trainer', 'club']).optional(),
  })
  .strict();

const actorSchema = z.object({ userId: z.number().int().positive() }).strict();

const rejectSchema = z
  .object({
    userId: z.number().int().positive(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

const LINK_STATUSES = ['pending', 'confirmed', 'rejected', 'revoked'];

function parseLinkId(raw: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректный id связи');
  }

  return parsed;
}

function parseOptionalId(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;

  if (!/^\d+$/.test(raw)) {
    throw new ValidationError('Некорректные параметры запроса');
  }

  return Number(raw);
}

@Controller('trainer-club-links')
export class TrainerClubLinksController {
  constructor(
    private readonly links: LinkService,
    private readonly logs: LogService,
  ) {}

  @Get()
  async findMany(
    @Query('trainerId') trainerId?: string,
    @Query('clubId') clubId?: string,
    @Query('status') status?: string,
  ): Promise<TrainerClubLink[]> {
    if (status !== undefined && !LINK_STATUSES.includes(status)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    return this.links.list({
      trainerId: parseOptionalId(trainerId),
      clubId: parseOptionalId(clubId),
      status: status as TrainerClubLinkStatus | undefined,
    });
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<TrainerClubLink> {
    const parsed = createSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { link, initiatedBy } = await this.links.create(parsed.data);

    await this.logs.record({
      action: 'link_request',
      actorId: parsed.data.userId,
      actorRole: initiatedBy === 'club' ? 'club_owner' : 'trainer',
      entityType: 'trainer_club_link',
      entityId: link.id,
      meta: { trainerId: link.trainerId, clubId: link.clubId, initiatedBy },
    });

    return link;
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<TrainerClubLink> {
    const linkId = parseLinkId(rawId);
    const parsed = actorSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { link, approverIsClub } = await this.links.approve(linkId, parsed.data.userId);

    await this.logs.record({
      action: 'link_approve',
      actorId: parsed.data.userId,
      actorRole: approverIsClub ? 'club_owner' : 'trainer',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: { trainerId: link.trainerId, clubId: link.clubId, initiatedBy: link.initiatedBy },
    });

    return link;
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<TrainerClubLink> {
    const linkId = parseLinkId(rawId);
    const parsed = rejectSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { link, rejectorIsClub } = await this.links.reject(
      linkId,
      parsed.data.userId,
      parsed.data.reason,
    );

    await this.logs.record({
      action: 'link_reject',
      actorId: parsed.data.userId,
      actorRole: rejectorIsClub ? 'club_owner' : 'trainer',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: {
        trainerId: link.trainerId,
        clubId: link.clubId,
        reason: parsed.data.reason,
        initiatedBy: link.initiatedBy,
      },
    });

    return link;
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<TrainerClubLink> {
    const linkId = parseLinkId(rawId);
    const parsed = actorSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { link, revokedBy, detachedCount } = await this.links.revoke(linkId, parsed.data.userId);

    await this.logs.record({
      action: 'link_revoke',
      actorId: parsed.data.userId,
      // Роль тренера здесь не пишется намеренно — так было до переноса.
      actorRole: revokedBy === 'admin' ? 'admin' : 'club_owner',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: { trainerId: link.trainerId, clubId: link.clubId, revokedBy, detachedCount },
    });

    return link;
  }
}

export const LINK_CONTROLLERS = [TrainerClubLinksController];
