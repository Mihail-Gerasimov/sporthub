// Контроллер отзывов.
//
// Отзыв ставится либо клубу, либо тренеру — ровно одному. Проверка «ровно один
// адресат» повторяется дважды с разными текстами ошибок, и оба текста закреплены
// тестами: без адресата — «Нужно указать clubId или trainerId», с обоими —
// «Нужно указать либо clubId, либо trainerId».
//
// Уведомления идут обеим сторонам: провайдеру о полученном отзыве (кроме случая,
// когда провайдер оценивает сам себя) и автору о публикации отзыва.
//
// Фаза 34, шаг 34.39 — решение заказчика от 08.09.2026: отзыв принимается только
// от того, кто у этого клуба или тренера ЗАНИМАЛСЯ. До этого шага маршрут не
// проверял ничего, кроме существования адресата, и даже не знал про записи: любой
// желающий ставил оценку любой публикации, а она тут же пересчитывала публичный
// рейтинг. Автор берётся из сессии, посещение — из его же записей.
//
// Правило посещения — не «был хотя бы раз», а **одна оценка на посещение**
// (чек-лист фазы 34, step-41). Проверка «был хотя бы раз» отвечала на вопрос
// «пускать ли вообще» и молчала о том, сколько раз: человек с ОДНИМ завершённым
// занятием оставлял отзывы подряд, и каждый пересчитывал публичный рейтинг.
// Потолок числа отзывов адресату — число завершённых записей к нему же.

import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { COMPLETED_BOOKING_STATUSES } from '@sporthub/domain';
import type { Review } from '@sporthub/types';
import { APP_LIMITS } from '@sporthub/types';
import { z } from 'zod';

import { CurrentUser, Public, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../common/domain-error';
import { AccessService } from '../access/access.service';
import { NotificationService } from '../notifications/notification.service';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type { ReviewsRepository } from '../repositories/crud.repository';
import { REVIEWS_REPOSITORY } from '../repositories/crud.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import type { TransactionRunner } from '../storage/transaction-runner';
import { TRANSACTION_RUNNER } from '../storage/transaction-runner';

const createReviewSchema = z.object({
  // Номера автора здесь нет и быть не может: он приходит из сессии. Схема
  // не строгая — старый клиент ещё шлёт своё поле, и оно молча отбрасывается.
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
    // Записи автора — единственный источник ответа на вопрос «а он тут был?».
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    private readonly notifications: NotificationService,
    // Владение и правило «сам себе» спрашиваются у общего сервиса, а не считаются
    // здесь: две правды о владении разошлись бы при первой же правке.
    private readonly access: AccessService,
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

  /**
   * Право на отзыв: одна оценка на посещение.
   *
   * Считаются два числа — сколько занятий у этого адресата автор ПРОШЁЛ и сколько
   * оценок он ему уже поставил. Пока оценок меньше посещений, право есть; сравнялись —
   * право исчерпано. Такое правило разом закрывает обе дыры: отзыв без посещения
   * (посещений ноль) и вторую оценку за то же посещение.
   *
   * Считает база — два `count` по отбору, а не длина прочитанных срезов записей
   * и отзывов: под оба отбора есть индексы, и чтение всей истории атлета и всех
   * отзывов клуба ради двух чисел было бы тем же перебором в памяти, от которого
   * уходили в 33.48.
   *
   * ⚠️ Оба счёта идут ПОДРЯД, а не параллельно, хотя и независимы: проверка идёт
   * внутри транзакции, а у транзакции одно соединение. Два запроса на нём разом —
   * это не «вдвое быстрее», а два запроса в очереди к одному сокету.
   *
   * Набор завершённых состояний берётся из словаря домена, а не выписывается здесь
   * литералом: он уже объявлен один раз (`completed` — с отметкой провайдера,
   * `no_show` — неявка, `unmarked` — отметку не поставили в срок) и должен остаться
   * одним. Занятие в этих состояниях уже прошло — а значит, автору есть что оценивать;
   * запись, которая ещё только предстоит (`pending`, `confirmed`), права на отзыв
   * не даёт.
   *
   * Клуб у записи считается по обеим ссылкам — владелец и площадка: тренерское
   * занятие в чужом зале посещено и у тренера, и у клуба, и даёт право на оценку
   * обоим. Квоты при этом РАЗДЕЛЬНЫЕ: оценка клубу не расходует право оценить тренера.
   *
   * ⚠️ Зовётся ИЗНУТРИ транзакции вставки — см. комментарий в `create`.
   */
  private async assertCanReview(
    userId: number,
    target: { clubId?: number; trainerId?: number },
  ): Promise<void> {
    // ⚠️ Шаг 35.12, точка 7. Отзыв своему лицу запрещён (решение заказчика 17).
    // Сегодня это держится случайно — правом `write_reviews`, которого нет у ролей
    // провайдера. Как только роли уйдут, откроется цепочка накрутки: записался
    // к себе → отметил посещение → написал отзыв. Отметку посещения уже закрыл
    // шаг 35.11, отзыв закрывается здесь — рвём цепочку в двух местах, а не в одном.
    const own =
      (target.clubId !== undefined &&
        (await this.access.isSelfDealing(userId, { kind: 'club', clubId: target.clubId }))) ||
      (target.trainerId !== undefined &&
        (await this.access.isSelfDealing(userId, {
          kind: 'trainer',
          trainerId: target.trainerId,
        })));

    if (own) {
      throw new ForbiddenError('Нельзя оставить отзыв собственной публикации');
    }

    const visits = await this.bookings.count({
      userId,
      clubId: target.clubId,
      trainerId: target.trainerId,
      status: [...COMPLETED_BOOKING_STATUSES],
    });

    if (visits === 0) {
      throw new ForbiddenError('Оставить отзыв можно только после посещения занятия');
    }

    const given = await this.reviews.count({
      userId,
      clubId: target.clubId,
      trainerId: target.trainerId,
    });

    // Тексты разные намеренно: «сначала сходи» и «за это уже оценил» — разные
    // причины отказа, и человек по ответу обязан понимать, какая из них его.
    if (given >= visits) {
      throw new ConflictError('На это посещение отзыв уже оставлен');
    }
  }

  // Открыто гостю: чтение отзывов — половина решения «идти сюда или нет».
  // Оценки и тексты видны на карточках клубов и тренеров, то есть до всякого входа.
  //
  // Пометка стоит на методе, а не на классе: создание отзыва рядом — действие
  // от своего имени, и публичным оно не станет (шаги 34.21 и 34.39).
  @Public()
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

    // Порядок «свежие первыми» просит запрос, а не наводит потребитель:
    // индексы отзывов включают метку времени в ключ, и до этого их хвост простаивал.
    return this.reviews.findMany({ clubId, trainerId, order: 'newest' });
  }

  /**
   * Отзыв о клубе или тренере.
   *
   * Право `write_reviews` есть только у спортсмена: оценка — действие клиента
   * площадки. Одного права мало — нужно ещё и посещение, иначе накрутка рейтинга
   * стоит ровно один запрос.
   */
  @Post()
  async create(@Body() rawBody: unknown, @CurrentUser() session: SessionContext): Promise<Review> {
    const parsed = createReviewSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные отзыва');
    }

    const { clubId, rating, text, trainerId } = parsed.data;
    // Автор — тот, от чьего лица действуют. Под имперсонизацией отзыв остаётся
    // отзывом пользователя, а не администратора.
    const user = session.user;
    const userId = user.id;

    if (clubId === undefined && trainerId === undefined) {
      throw new ValidationError('Нужно указать clubId или trainerId');
    }

    if (!hasExactlyOneTarget({ clubId, trainerId })) {
      throw new ValidationError('Нужно указать либо clubId, либо trainerId');
    }

    const [club, trainer] = await Promise.all([
      clubId === undefined ? Promise.resolve(null) : this.clubs.findById(clubId),
      trainerId === undefined ? Promise.resolve(null) : this.trainers.findById(trainerId),
    ]);

    if (clubId !== undefined && !club) {
      throw new NotFoundError('Клуб не найден');
    }

    if (trainerId !== undefined && !trainer) {
      throw new NotFoundError('Тренер не найден');
    }

    // ⚠️ Проверка права стоит ВНУТРИ транзакции, рядом со вставкой, а не перед ней.
    //
    // Снаружи между «посчитал» и «записал» помещается второй такой же запрос: оба
    // видят квоту нетронутой, оба проходят проверку, и одно посещение превращается
    // в два отзыва — ровно тот дефект, который правило и закрывает. Так же стоят
    // проверки дубля и свободных мест при записи на занятие.
    //
    // Вставка и пересчёт агрегатов — та же транзакция. Порознь они дают карточку
    // с отзывом, но со старым рейтингом: расхождение видно сразу, а починить его
    // нечем — писателя у этих полей до сих пор не было.
    const review = await this.transactions.runInTransaction(async () => {
      await this.assertCanReview(userId, { clubId, trainerId });

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
