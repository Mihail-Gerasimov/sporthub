// Контроллеры клубов и тренеров.
//
// Самая большая группа маршрутов: публичная выдача с фильтрами и сортировкой
// по надёжности, детальная карточка, публикация, правка и удаление.
//
// ⚠️ Правка клуба и тренера подменяет текст ошибки: любое «не найдено» изнутри
// (сама сущность, основная услуга, слот) выходит наружу как общее «Клуб не найден».
// Это вводит в заблуждение, но покрыто тестами и потому сохранено дословно.

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  computeClubReliability,
  computeTrainerReliability,
  publishClubSchema,
  publishTrainerSchema,
} from '@sporthub/domain';
import type { Club, Trainer } from '@sporthub/types';

import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { DomainError, NotFoundError, ValidationError } from '../common/domain-error';
import { CatalogQueryService } from './catalog-query.service';
import { LogService } from '../logs/log.service';
import { PublicationService } from '../publications/publication.service';

/** Разбор идентификатора с текстом своего домена. */
function parseId(raw: string, message: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(message);
  }

  return parsed;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректные параметры запроса');
  }

  return parsed;
}

@Controller('clubs')
export class ClubsController {
  constructor(
    private readonly query: CatalogQueryService,
    private readonly publications: PublicationService,
    private readonly logs: LogService,
  ) {}

  @Get()
  async findMany(
    @Query('sportId') sportId?: string,
    @Query('search') search?: string,
    @Query('minRating') minRating?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('excludeDanger') excludeDanger?: string,
    @Query('includeHidden') includeHidden?: string,
  ): Promise<Club[]> {
    if (sort !== undefined && sort !== 'reliability') {
      throw new ValidationError('Некорректные параметры запроса');
    }
    if (dir !== undefined && dir !== 'asc' && dir !== 'desc') {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const rating = minRating === undefined || minRating === '' ? undefined : Number(minRating);

    if (rating !== undefined && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    let clubs = await this.query.findPublishedClubs({
      sportId: parseOptionalNumber(sportId),
      search: search?.trim() || undefined,
      minRating: rating,
      // Скрытые публикации нужны личным кабинетам и админскому разделу:
      // владелец должен видеть, что его публикация спрятана.
      includeHidden: includeHidden === 'true',
    });

    if (sort === 'reliability' || excludeDanger === 'true') {
      const bookings = await this.query.allBookings();
      const byId = new Map(
        clubs.map((club) => [club.id, computeClubReliability(bookings, club.id)]),
      );

      if (excludeDanger === 'true') {
        clubs = clubs.filter((club) => byId.get(club.id)?.badge !== 'danger');
      }

      if (sort === 'reliability') {
        clubs = clubs.slice().sort((left, right) => {
          const leftRate = byId.get(left.id)?.completionRate ?? 0;
          const rightRate = byId.get(right.id)?.completionRate ?? 0;

          if (rightRate !== leftRate) {
            return dir === 'asc' ? leftRate - rightRate : rightRate - leftRate;
          }

          return right.rating - left.rating;
        });
      }
    }

    return clubs;
  }

  /**
   * Поиск по адресу-ссылке. Отдельным маршрутом, а не через `:id`: адрес-ссылка
   * и числовой идентификатор — разные способы адресации, и смешивать их в одном
   * параметре значит гадать по виду значения.
   */
  @Get('by-slug/:slug')
  async findOneBySlug(@Param('slug') slug: string): Promise<unknown> {
    const club = await this.query.findClubBySlug(slug);

    if (!club) {
      throw new NotFoundError('Клуб не найден');
    }

    return this.query.getClubDetail(club.id);
  }

  @Get(':id')
  async findOne(@Param('id') rawId: string): Promise<unknown> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    const detail = await this.query.getClubDetail(clubId);

    if (!detail) {
      throw new NotFoundError('Клуб не найден');
    }

    return detail;
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<unknown> {
    const parsed = publishClubSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные клуба',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    const { userId, ...form } = parsed.data;
    await this.query.requireUser(userId);
    await this.query.rememberCity(form.city, form.cityCoordinates);

    const result = await this.publications.createClubFromForm(form, userId);

    await this.logs.record({
      action: 'publish_create',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: result.club.id,
      meta: { name: result.club.name, city: result.club.city },
    });

    return result;
  }

  @Patch(':id')
  async update(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<unknown> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    const parsed = publishClubSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные клуба',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    const { userId, ...form } = parsed.data;
    await this.query.requireUser(userId);
    await this.query.rememberCity(form.city, form.cityCoordinates);

    try {
      const result = await this.publications.updateClubFromForm(form, clubId, userId);

      await this.logs.record({
        action: 'publish_update',
        actorId: userId,
        actorRole: 'club_owner',
        entityType: 'club',
        entityId: clubId,
        meta: { name: result.club.name },
      });

      return result;
    } catch (error) {
      // Подмена текста при правке: наружу уходит общее «Клуб не найден»,
      // даже если внутри не найдены услуга или слот. Поведение сохранено.
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Клуб не найден');
      }

      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') rawId: string): Promise<EmptyResult> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    const club = await this.query.findClub(clubId);

    await this.publications.deleteClub(clubId);

    await this.logs.record({
      action: 'publish_delete',
      actorId: club?.managedByUserId ?? 0,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: clubId,
      meta: { name: club?.name ?? 'unknown' },
    });

    return EMPTY_RESULT;
  }
}

@Controller('trainers')
export class TrainersController {
  constructor(
    private readonly query: CatalogQueryService,
    private readonly publications: PublicationService,
    private readonly logs: LogService,
  ) {}

  @Get()
  async findMany(
    @Query('affiliatedClubId') affiliatedClubId?: string,
    @Query('clubId') clubId?: string,
    @Query('sportId') sportId?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('excludeDanger') excludeDanger?: string,
    @Query('includeHidden') includeHidden?: string,
  ): Promise<Trainer[]> {
    if (sort !== undefined && sort !== 'reliability') {
      throw new ValidationError('Некорректные параметры запроса');
    }
    if (dir !== undefined && dir !== 'asc' && dir !== 'desc') {
      throw new ValidationError('Некорректные параметры запроса');
    }

    let trainers = await this.query.findPublishedTrainers({
      // Оба имени параметра поддерживаются — так было до переноса.
      clubId: parseOptionalNumber(affiliatedClubId) ?? parseOptionalNumber(clubId),
      sportId: parseOptionalNumber(sportId),
      includeHidden: includeHidden === 'true',
    });

    if (sort === 'reliability' || excludeDanger === 'true') {
      const bookings = await this.query.allBookings();
      const byId = new Map(
        trainers.map((trainer) => [trainer.id, computeTrainerReliability(bookings, trainer.id)]),
      );

      if (excludeDanger === 'true') {
        trainers = trainers.filter((trainer) => byId.get(trainer.id)?.badge !== 'danger');
      }

      if (sort === 'reliability') {
        return trainers.slice().sort((left, right) => {
          const leftRate = byId.get(left.id)?.completionRate ?? 0;
          const rightRate = byId.get(right.id)?.completionRate ?? 0;

          if (rightRate !== leftRate) {
            return dir === 'asc' ? leftRate - rightRate : rightRate - leftRate;
          }

          return right.rating - left.rating;
        });
      }
    }

    // Умолчание: по рейтингу, при равенстве — по числу отзывов.
    return trainers.sort((left, right) =>
      right.rating !== left.rating
        ? right.rating - left.rating
        : right.reviewCount - left.reviewCount,
    );
  }

  @Get('by-slug/:slug')
  async findOneBySlug(@Param('slug') slug: string): Promise<unknown> {
    const trainer = await this.query.findTrainerBySlug(slug);

    if (!trainer) {
      throw new NotFoundError('Тренер не найден');
    }

    return this.query.getTrainerDetail(trainer.id);
  }

  @Get(':id')
  async findOne(@Param('id') rawId: string): Promise<unknown> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    const detail = await this.query.getTrainerDetail(trainerId);

    if (!detail) {
      throw new NotFoundError('Тренер не найден');
    }

    return detail;
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<unknown> {
    const parsed = publishTrainerSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные тренера',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    const { userId, ...form } = parsed.data;
    await this.query.requireUser(userId);
    await this.query.rememberCity(form.city, form.cityCoordinates);

    const result = await this.publications.createTrainerFromForm(form, userId);

    await this.logs.record({
      action: 'publish_create',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'trainer',
      entityId: result.trainer.id,
      meta: { name: result.trainer.name, city: result.trainer.city },
    });

    return result;
  }

  @Patch(':id')
  async update(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<unknown> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    const parsed = publishTrainerSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные тренера',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    const { userId, ...form } = parsed.data;
    await this.query.requireUser(userId);
    await this.query.rememberCity(form.city, form.cityCoordinates);

    try {
      const result = await this.publications.updateTrainerFromForm(form, trainerId, userId);

      await this.logs.record({
        action: 'publish_update',
        actorId: userId,
        actorRole: 'club_owner',
        entityType: 'trainer',
        entityId: trainerId,
        meta: { name: result.trainer.name },
      });

      return result;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError('Тренер не найден');
      }

      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') rawId: string): Promise<EmptyResult> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    const trainer = await this.query.findTrainer(trainerId);

    await this.publications.deleteTrainer(trainerId);

    await this.logs.record({
      action: 'publish_delete',
      actorId: trainer?.managedByUserId ?? 0,
      actorRole: 'club_owner',
      entityType: 'trainer',
      entityId: trainerId,
      meta: { name: trainer?.name ?? 'unknown' },
    });

    return EMPTY_RESULT;
  }
}

export { DomainError };
export const CLUB_CONTROLLERS = [ClubsController, TrainersController];
