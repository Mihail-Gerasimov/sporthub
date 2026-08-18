// Контроллер отзывов.
//
// Отзыв ставится либо клубу, либо тренеру — ровно одному. Проверка «ровно один
// адресат» повторяется дважды с разными текстами ошибок, и оба текста закреплены
// тестами: без адресата — «Нужно указать clubId или trainerId», с обоими —
// «Нужно указать либо clubId, либо trainerId».
//
// Уведомления идут обеим сторонам: провайдеру о полученном отзыве (кроме случая,
// когда провайдер оценивает сам себя) и автору о публикации отзыва.

import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import type { Review } from "@sporthub/types";
import { z } from "zod";

import { NotFoundError, ValidationError } from "../common/domain-error";
import { NotificationService } from "../notifications/notification.service";
import type {
  ReviewsRepository,
  UsersRepository,
} from "../repositories/crud.repository";
import {
  REVIEWS_REPOSITORY,
  USERS_REPOSITORY,
} from "../repositories/crud.repository";
import type {
  ClubsRepository,
  TrainersRepository,
} from "../repositories/entities.repository";
import {
  CLUBS_REPOSITORY,
  TRAINERS_REPOSITORY,
} from "../repositories/entities.repository";

const createReviewSchema = z.object({
  userId: z.number().int().positive(),
  clubId: z.number().int().positive().optional(),
  trainerId: z.number().int().positive().optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(1),
});

/** Ровно один адресат: либо клуб, либо тренер. */
function hasExactlyOneTarget(input: {
  clubId?: number;
  trainerId?: number;
}): boolean {
  return (input.clubId === undefined) !== (input.trainerId === undefined);
}

function optionalId(raw: string | undefined): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError("Некорректные параметры запроса");
  }

  return parsed;
}

@Controller("reviews")
export class ReviewsController {
  constructor(
    @Inject(REVIEWS_REPOSITORY) private readonly reviews: ReviewsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  async findMany(
    @Query("clubId") rawClubId?: string,
    @Query("trainerId") rawTrainerId?: string,
  ): Promise<Review[]> {
    const clubId = optionalId(rawClubId);
    const trainerId = optionalId(rawTrainerId);

    // Ни одного адресата — отдаём всё; оба сразу — ошибка.
    if (
      !hasExactlyOneTarget({ clubId, trainerId }) &&
      !(clubId === undefined && trainerId === undefined)
    ) {
      throw new ValidationError("Нужно указать либо clubId, либо trainerId");
    }

    const reviews = await this.reviews.findMany({ clubId, trainerId });

    return reviews.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<Review> {
    const parsed = createReviewSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError("Некорректные данные отзыва");
    }

    const { clubId, rating, text, trainerId, userId } = parsed.data;

    if (clubId === undefined && trainerId === undefined) {
      throw new ValidationError("Нужно указать clubId или trainerId");
    }

    if (!hasExactlyOneTarget({ clubId, trainerId })) {
      throw new ValidationError("Нужно указать либо clubId, либо trainerId");
    }

    const [club, trainer, user] = await Promise.all([
      clubId === undefined
        ? Promise.resolve(null)
        : this.clubs.findById(clubId),
      trainerId === undefined
        ? Promise.resolve(null)
        : this.trainers.findById(trainerId),
      this.users.findById(userId),
    ]);

    if (!user) {
      throw new NotFoundError("Пользователь не найден");
    }

    if (clubId !== undefined && !club) {
      throw new NotFoundError("Клуб не найден");
    }

    if (trainerId !== undefined && !trainer) {
      throw new NotFoundError("Тренер не найден");
    }

    const review = await this.reviews.insert({
      userId,
      clubId,
      trainerId,
      rating,
      text,
    } as Omit<Review, "id" | "createdAt">);

    const entity = club ?? trainer;
    const entityType: "club" | "trainer" =
      clubId !== undefined ? "club" : "trainer";
    const entityId = clubId ?? (trainerId as number);
    const ownerUserId = entity?.managedByUserId;
    const entityName = entity?.name ?? "";

    // Отзыв самому себе теоретически возможен через инструменты разработчика —
    // провайдеру в этом случае уведомление не уходит.
    if (ownerUserId !== undefined && ownerUserId !== userId) {
      await this.notifications.notify(
        ownerUserId,
        "review_received_by_provider",
        {
          reviewId: review.id,
          entityType,
          entityId,
          fromUserId: userId,
          authorName: user.name,
          rating,
          entityName,
        },
      );
    }

    await this.notifications.notify(userId, "review_published_for_athlete", {
      reviewId: review.id,
      entityType,
      entityId,
      entityName,
    });

    return review;
  }
}

export const REVIEW_CONTROLLERS = [ReviewsController];
