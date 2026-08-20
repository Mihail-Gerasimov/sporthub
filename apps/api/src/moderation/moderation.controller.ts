// Модерация публикаций и сводный список для админского раздела.
//
// Скрытие ставит причину, восстановление её снимает. Публикация без явного
// состояния считается опубликованной — так устроены исходные данные.

import { compareByCreatedAtDesc } from '@sporthub/domain';
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import type { CatalogOwnerType, Club, Trainer } from '@sporthub/types';

import { withTopLevel, type TopLevelResult } from '../common/api-response';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import { LogService } from '../logs/log.service';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';

/** Строка сводного списка: клуб и тренер приводятся к одной форме. */
export type PublicationItem = {
  id: number;
  name: string;
  type: CatalogOwnerType;
  city: string;
  sportIds: number[];
  status: string | undefined;
  createdAt: string;
  managedByUserId: number | undefined;
  hideReason?: string;
  hiddenAt?: string;
};

function clubToItem(club: Club): PublicationItem {
  return {
    id: club.id,
    name: club.name,
    type: 'club',
    city: club.city,
    sportIds: club.sportIds,
    status: club.status,
    createdAt: club.createdAt,
    managedByUserId: club.managedByUserId,
    hideReason: club.hideReason,
    hiddenAt: club.hiddenAt,
  };
}

function trainerToItem(trainer: Trainer): PublicationItem {
  return {
    id: trainer.id,
    name: trainer.name,
    type: 'trainer',
    city: trainer.city ?? '',
    sportIds: trainer.sportIds,
    status: trainer.status,
    createdAt: trainer.createdAt,
    managedByUserId: trainer.managedByUserId,
    hideReason: trainer.hideReason,
    hiddenAt: trainer.hiddenAt,
  };
}

@Controller('moderation')
export class ModerationController {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly logs: LogService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async moderate(@Body() rawBody: unknown): Promise<Club | Trainer> {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const action = body.action;
    const entityType = body.entityType;
    const entityId = body.entityId;
    const moderatorId = body.moderatorId;
    const reason = body.reason;

    // Проверки идут по одной, каждая со своим текстом — форма проверки
    // повторяет прежнюю дословно.
    if (typeof action !== 'string' || !['hide', 'unhide'].includes(action)) {
      throw new ValidationError('Некорректное действие. Ожидается hide или unhide');
    }

    if (typeof entityType !== 'string' || !['club', 'trainer'].includes(entityType)) {
      throw new ValidationError('Некорректный тип сущности');
    }

    if (typeof entityId !== 'number' || !entityId) {
      throw new ValidationError('Некорректный entityId');
    }

    if (typeof moderatorId !== 'number' || !moderatorId) {
      throw new ValidationError('Некорректный moderatorId');
    }

    if (action === 'hide' && (typeof reason !== 'string' || !reason.trim())) {
      throw new ValidationError('Причина скрытия обязательна');
    }

    const moderator = await this.users.findById(moderatorId);

    if (!moderator || moderator.role !== 'admin') {
      throw new ForbiddenError('Только администратор может модерировать публикации');
    }

    const owner = entityType as CatalogOwnerType;
    const entity =
      action === 'hide'
        ? await this.hide(owner, entityId, (reason as string).trim(), moderatorId)
        : await this.unhide(owner, entityId);

    await this.logs.record({
      action: action === 'hide' ? 'moderation_hide' : 'moderation_unhide',
      actorId: moderatorId,
      actorRole: 'admin',
      entityType: owner,
      entityId,
      meta:
        action === 'hide'
          ? { name: entity.name, reason: (reason as string).trim() }
          : { name: entity.name },
    });

    return entity;
  }

  private async hide(
    entityType: CatalogOwnerType,
    entityId: number,
    reason: string,
    moderatorId: number,
  ): Promise<Club | Trainer> {
    const patch = {
      status: 'hidden' as const,
      hideReason: reason,
      hiddenByUserId: moderatorId,
      hiddenAt: new Date().toISOString(),
    };

    if (entityType === 'club') {
      await this.requireClub(entityId);

      return this.clubs.update(entityId, patch);
    }

    await this.requireTrainer(entityId);

    return this.trainers.update(entityId, patch);
  }

  private async unhide(entityType: CatalogOwnerType, entityId: number): Promise<Club | Trainer> {
    const patch = {
      status: 'published' as const,
      hideReason: undefined,
      hiddenByUserId: undefined,
      hiddenAt: undefined,
    };

    if (entityType === 'club') {
      await this.requireClub(entityId);

      return this.clubs.update(entityId, patch);
    }

    await this.requireTrainer(entityId);

    return this.trainers.update(entityId, patch);
  }

  private async requireClub(entityId: number): Promise<void> {
    if (!(await this.clubs.findById(entityId))) {
      throw new NotFoundError('Клуб не найден');
    }
  }

  private async requireTrainer(entityId: number): Promise<void> {
    if (!(await this.trainers.findById(entityId))) {
      throw new NotFoundError('Тренер не найден');
    }
  }
}

@Controller('publications')
export class PublicationsController {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
  ) {}

  @Get()
  async findMany(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('city') city?: string,
    @Query('sportId') rawSportId?: string,
    @Query('search') rawSearch?: string,
    @Query('offset') rawOffset?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<TopLevelResult<PublicationItem[]>> {
    const statusFilter = status ?? 'all';
    const typeFilter = type ?? 'all';
    const cityFilter = city ?? '';
    const sportId = rawSportId ? Number(rawSportId) : null;
    const search = (rawSearch ?? '').trim().toLowerCase();
    const offset = Math.max(0, Number(rawOffset ?? 0));
    const limit = Math.min(100, Math.max(1, Number(rawLimit ?? 50)));

    const [clubs, trainers] = await Promise.all([this.clubs.findAll(), this.trainers.findAll()]);

    let items: PublicationItem[] = [];

    if (typeFilter === 'all' || typeFilter === 'club') {
      items.push(...clubs.map(clubToItem));
    }

    if (typeFilter === 'all' || typeFilter === 'trainer') {
      items.push(...trainers.map(trainerToItem));
    }

    if (statusFilter === 'hidden') {
      items = items.filter((item) => item.status === 'hidden');
    } else if (statusFilter === 'published') {
      // Публикация без состояния считается опубликованной.
      items = items.filter((item) => item.status !== 'hidden');
    }

    if (cityFilter) {
      items = items.filter((item) => item.city === cityFilter);
    }

    if (sportId) {
      items = items.filter((item) => item.sportIds.includes(sportId));
    }

    if (search) {
      items = items.filter((item) => item.name.toLowerCase().includes(search));
    }

    items.sort(compareByCreatedAtDesc);

    return withTopLevel(items.slice(offset, offset + limit), {
      total: items.length,
      offset,
      limit,
    });
  }
}

export const MODERATION_CONTROLLERS = [ModerationController, PublicationsController];
