// Контроллер отзывов.
//
// Отзыв ставится либо клубу, либо тренеру — ровно одному. Проверка «ровно один
// адресат» повторяется дважды с разными текстами ошибок, и оба текста закреплены
// тестами: без адресата — «Нужно указать clubId или trainerId», с обоими —
// «Нужно указать либо clubId, либо trainerId».
//
// Уведомления идут обеим сторонам: провайдеру о полученном отзыве (кроме случая,
// когда провайдер оценивает сам себя) и автору о публикации отзыва.

import { compareByCreatedAtDesc } from '@sporthub/domain';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { Review } from '@sporthub/types';
import { APP_LIMITS } from '@sporthub/types';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '../common/domain-error';
import { NotificationService } from '../notifications/notification.service';
import type { ReviewsRepository, UsersRepository } from '../repositories/crud.repository';
import { REVIEWS_REPOSITORY, USERS_REPOSITORY } from '../repositories/crud.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import type { TransactionRunner } from '../storage/transaction-runner';
import { TRANSACTION_RUNNER } from '../storage/transaction-runner';

const createReviewSchema = z.object({
  userId: z.number().int().positive(),
  clubId: z.number().int().positive().optional(),
  trainerId: z.number().int().positive().optional(),
  rating: z.number().int().min(1).max(5),
  // Потолок длины берётся из общего словаря лимитов, а не из литерала:
  // то же число применяют обе формы отзыва на фронте.
  text: z.string().trim().min(1).max(APP_LIMITS.reviewTextMaxLength),
});

/** Ровно один адресат: либо клуб, либо тренер. */
function hasExactlyOneTarget(input: { clubId?: number; trainerId?: number }): boolean {
  return (input.clubId === undefined) !== (input.trainerId === undefined);
}

function optionalId(raw: string | undefined): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректные параметры запроса');
  }

  return parsed;
}

@Controller('reviews')
export class ReviewsController {
  constructor(
    @Inject(REVIEWS_REPOSITORY) private readonly reviews: ReviewsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Пересчёт агрегатов адресата по фактическим отзывам.
   *
   * Писателя у полей `rating` и `reviewCount` не было вовсе: в данных они стояли
   * нулями при живых отзывах. Считается по фактам, а не увеличением счётчика:
   * увеличение накапливает расхождение при каждом сбое, пересчёт — нет.
   */
  private async recomputeAggregates(target: {
    clubId?: number;
    trainerId?: number;
  }): Promise<void> {
    const reviews = await this.reviews.findMany(target);
    const reviewCount = reviews.length;
    // Один знак после запятой — тот же вид, в котором рейтинг живёт в данных
    // и показывается в карточке.
    const rating =
      reviewCount === 0
        ? 0
        : Math.round((reviews.reduce((sum, item) => sum + item.rating, 0) / reviewCount) * 10) / 10;

    if (target.clubId !== undefined) {
      await this.clubs.update(target.clubId, { rating, reviewCount });

      return;
    }

    if (target.trainerId !== undefined) {
      await this.trainers.update(target.trainerId, { rating, reviewCount });
    }
  }

  @Get()
  async findMany(
    @Query('clubId') rawClubId?: string,
    @Query('trainerId') rawTrainerId?: string,
  ): Promise<Review[]> {
    const clubId = optionalId(rawClubId);
    const trainerId = optionalId(rawTrainerId);

    // Ни одного адресата — отдаём всё; оба сразу — ошибка.
    if (
      !hasExactlyOneTarget({ clubId, trainerId }) &&
      !(clubId === undefined && trainerId === undefined)
    ) {
      throw new ValidationError('Нужно указать либо clubId, либо trainerId');
    }

    const reviews = await this.reviews.findMany({ clubId, trainerId });

    return reviews.sort(compareByCreatedAtDesc);
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<Review> {
    const parsed = createReviewSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные отзыва');
    }

    const { clubId, rating, text, trainerId, userId } = parsed.data;

    if (clubId === undefined && trainerId === undefined) {
      throw new ValidationError('Нужно указать clubId или trainerId');
    }

    if (!hasExactlyOneTarget({ clubId, trainerId })) {
      throw new ValidationError('Нужно указать либо clubId, либо trainerId');
    }

    const [club, trainer, user] = await Promise.all([
      clubId === undefined ? Promise.resolve(null) : this.clubs.findById(clubId),
      trainerId === undefined ? Promise.resolve(null) : this.trainers.findById(trainerId),
      this.users.findById(userId),
    ]);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    if (clubId !== undefined && !club) {
      throw new NotFoundError('Клуб не найден');
    }

    if (trainerId !== undefined && !trainer) {
      throw new NotFoundError('Тренер не найден');
    }

    // Вставка и пересчёт агрегатов — одна транзакция. Порознь они дают карточку
    // с отзывом, но со старым рейтингом: расхождение видно сразу, а починить его
    // нечем — писателя у этих полей до сих пор не было.
    const review = await this.transactions.runInTransaction(async () => {
      const created = await this.reviews.insert({
        userId,
        clubId,
        trainerId,
        rating,
        text,
      } as Omit<Review, 'id' | 'createdAt'>);

      await this.recomputeAggregates({ clubId, trainerId });

      return created;
    });

    const entity = club ?? trainer;
    const entityType: 'club' | 'trainer' = clubId !== undefined ? 'club' : 'trainer';
    const entityId = clubId ?? (trainerId as number);
    const ownerUserId = entity?.managedByUserId;
    const entityName = entity?.name ?? '';

    // Отзыв самому себе теоретически возможен через инструменты разработчика —
    // провайдеру в этом случае уведомление не уходит.
    if (ownerUserId !== undefined && ownerUserId !== userId) {
      await this.notifications.notify(ownerUserId, 'review_received_by_provider', {
        reviewId: review.id,
        entityType,
        entityId,
        fromUserId: userId,
        authorName: user.name,
        rating,
        entityName,
      });
    }

    await this.notifications.notify(userId, 'review_published_for_athlete', {
      reviewId: review.id,
      entityType,
      entityId,
      entityName,
    });

    return review;
  }
}

export const REVIEW_CONTROLLERS = [ReviewsController];
