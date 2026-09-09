// Контроллеры клубов и тренеров.
//
// Самая большая группа маршрутов: публичная выдача с фильтрами и сортировкой
// по надёжности, детальная карточка, публикация, правка и удаление.
//
// Доступ: публична только ЧАСТЬ маршрутов — три чтения у клубов и три у тренеров.
// Публикация, правка и удаление остаются закрытыми: это действия владельца, и
// исполнителя для них берут из сессии (шаги 34.22 и 34.38). Поэтому пометки стоят
// на методах, а не на классе.
//
// Этап Э8a (решение заказчика от 08.09.2026): у клубов и у тренеров теперь РАЗНЫЕ
// права. Клуб ведёт представитель услуг (`manage_own_clubs`), карточку тренера —
// сам тренер (`manage_own_trainer_profile`). До этого обе роли имели один набор,
// и тренер мог опубликовать клуб, а владелец клуба — выйти на площадку тренером.
// Удаление принимает ещё и право модерации: чужую публикацию сносит администратор,
// и владения от него не требуется.
//
// ⚠️ Правка клуба и тренера подменяет текст ошибки: любое «не найдено» изнутри
// (сама сущность, основная услуга, слот) выходит наружу как общее «Клуб не найден».
// Это вводит в заблуждение, но покрыто тестами и потому сохранено дословно.

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { publishClubSchema, publishTrainerSchema, roleCan } from '@sporthub/domain';
import type { Club, Trainer } from '@sporthub/types';

import { CurrentUser, Public, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../common/domain-error';
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

  // Открыто гостю: список клубов с фильтрами — это сама витрина площадки.
  // Человек должен найти свой клуб и решить, стоит ли ради него заводить учётку;
  // требование входа означало бы «сначала зарегистрируйся, потом посмотри, что тут есть».
  @Public()
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

    // Надёжность считается ОДНИМ запросом-агрегатом и едет вместе с карточками:
    // на ней держатся и отсев ненадёжных, и сортировка, и публичный бейдж. Раньше
    // бейдж считал фронт, забирая ради него все записи площадки, — а после закрытия
    // полного среза публичные страницы просто перестали открываться.
    const reliability = await this.query.reliabilityFor({
      clubIds: clubs.map((club) => club.id),
      trainerIds: [],
    });
    const byId = reliability.clubs;

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

    return clubs.map((club) => ({ ...club, reliability: byId.get(club.id) }));
  }

  /**
   * Поиск по адресу-ссылке. Отдельным маршрутом, а не через `:id`: адрес-ссылка
   * и числовой идентификатор — разные способы адресации, и смешивать их в одном
   * параметре значит гадать по виду значения.
   */
  // Открыто гостю: по адресу-ссылке клуба приходят из поиска и по ссылке из
  // мессенджера — на такой переход входа быть не может.
  @Public()
  @Get('by-slug/:slug')
  async findOneBySlug(@Param('slug') slug: string): Promise<unknown> {
    const club = await this.query.findClubBySlug(slug);

    if (!club) {
      throw new NotFoundError('Клуб не найден');
    }

    return this.query.getClubDetail(club.id);
  }

  // Открыто гостю: карточка клуба — расписание, услуги, отзывы, адрес на карте.
  // Это то, ради чего на площадку заходят, и закрывать её от незарегистрированного
  // значит закрывать площадку.
  @Public()
  @Get(':id')
  async findOne(@Param('id') rawId: string): Promise<unknown> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    const detail = await this.query.getClubDetail(clubId);

    if (!detail) {
      throw new NotFoundError('Клуб не найден');
    }

    return detail;
  }

  @Requires('manage_own_clubs')
  @Post()
  async create(@Body() rawBody: unknown, @CurrentUser() session: SessionContext): Promise<unknown> {
    const parsed = publishClubSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные клуба',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    const { userId: _ignoredUserId, ...form } = parsed.data;
    const userId = session.user.id;
    await this.query.rememberCity(form.city, form.cityCoordinates);

    const result = await this.publications.createClubFromForm(form, userId);

    await this.logs.record({
      action: 'publish_create',
      actorId: userId,
      // Роль пишется из сессии, а не константой: после разделения прав клуб
      // публикует представитель услуг, карточку тренера — тренер, и записанная
      // намертво роль врала бы в журнале ровно про то, ради чего разделение делалось.
      actorRole: session.user.role,
      entityType: 'club',
      entityId: result.club.id,
      meta: { name: result.club.name, city: result.club.city },
    });

    return result;
  }

  @Requires('manage_own_clubs')
  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<unknown> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    const parsed = publishClubSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные клуба',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    const { userId: _ignoredUserId, ...form } = parsed.data;
    const userId = session.user.id;
    await this.query.rememberCity(form.city, form.cityCoordinates);

    try {
      const result = await this.publications.updateClubFromForm(form, clubId, userId);

      await this.logs.record({
        action: 'publish_update',
        actorId: userId,
        actorRole: session.user.role,
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

  @Requires('manage_own_clubs', 'moderate_publications')
  @Delete(':id')
  async remove(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    const club = await this.query.findClub(clubId);

    // ⚠️ До фазы 34 маршрут не читал тело вовсе и не спрашивал, кто удаляет:
    // снести чужую публикацию вместе со всеми записями мог кто угодно. А в журнал
    // при этом писался владелец сущности — в аудите удаление выглядело его действием.
    //
    // Владельца сверяет сервис: выдача каталога поле владельца наружу не отдаёт,
    // и проверка по ней отказывала бы всегда. Администратору владелец не важен —
    // ему это разрешает право модерации.
    await this.publications.deleteClub(clubId, ownerCheckFor(session));

    await this.logs.record({
      action: 'publish_delete',
      actorId: session.actor.id,
      actorRole: session.actor.role,
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

  // Открыто гостю: та же витрина, только тренеры. Подбор тренера идёт до входа,
  // а не после.
  @Public()
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

    // То же для тренеров: один запрос-агрегат на всю выдачу.
    const reliability = await this.query.reliabilityFor({
      clubIds: [],
      trainerIds: trainers.map((trainer) => trainer.id),
    });
    const byId = reliability.trainers;

    if (excludeDanger === 'true') {
      trainers = trainers.filter((trainer) => byId.get(trainer.id)?.badge !== 'danger');
    }

    trainers =
      sort === 'reliability'
        ? trainers.slice().sort((left, right) => {
            const leftRate = byId.get(left.id)?.completionRate ?? 0;
            const rightRate = byId.get(right.id)?.completionRate ?? 0;

            if (rightRate !== leftRate) {
              return dir === 'asc' ? leftRate - rightRate : rightRate - leftRate;
            }

            return right.rating - left.rating;
          })
        : // Умолчание: по рейтингу, при равенстве — по числу отзывов.
          trainers.sort((left, right) =>
            right.rating !== left.rating
              ? right.rating - left.rating
              : right.reviewCount - left.reviewCount,
          );

    return trainers.map((trainer) => ({ ...trainer, reliability: byId.get(trainer.id) }));
  }

  // Открыто гостю: адрес-ссылка тренера — та же ссылка из поиска и переписки.
  @Public()
  @Get('by-slug/:slug')
  async findOneBySlug(@Param('slug') slug: string): Promise<unknown> {
    const trainer = await this.query.findTrainerBySlug(slug);

    if (!trainer) {
      throw new NotFoundError('Тренер не найден');
    }

    return this.query.getTrainerDetail(trainer.id);
  }

  // Открыто гостю: карточка тренера — специализации, цены, свободные слоты.
  // Гость выбирает, к кому идти, и только потом заводит учётку ради записи.
  @Public()
  @Get(':id')
  async findOne(@Param('id') rawId: string): Promise<unknown> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    const detail = await this.query.getTrainerDetail(trainerId);

    if (!detail) {
      throw new NotFoundError('Тренер не найден');
    }

    return detail;
  }

  @Requires('manage_own_trainer_profile')
  @Post()
  async create(@Body() rawBody: unknown, @CurrentUser() session: SessionContext): Promise<unknown> {
    const parsed = publishTrainerSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные тренера',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    const { userId: _ignoredUserId, ...form } = parsed.data;
    const userId = session.user.id;
    await this.query.rememberCity(form.city, form.cityCoordinates);

    const result = await this.publications.createTrainerFromForm(form, userId);

    await this.logs.record({
      action: 'publish_create',
      actorId: userId,
      actorRole: session.user.role,
      entityType: 'trainer',
      entityId: result.trainer.id,
      meta: { name: result.trainer.name, city: result.trainer.city },
    });

    return result;
  }

  @Requires('manage_own_trainer_profile')
  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<unknown> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    const parsed = publishTrainerSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные тренера',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    const { userId: _ignoredUserId, ...form } = parsed.data;
    const userId = session.user.id;
    await this.query.rememberCity(form.city, form.cityCoordinates);

    try {
      const result = await this.publications.updateTrainerFromForm(form, trainerId, userId);

      await this.logs.record({
        action: 'publish_update',
        actorId: userId,
        actorRole: session.user.role,
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

  @Requires('manage_own_trainer_profile', 'moderate_publications')
  @Delete(':id')
  async remove(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    const trainer = await this.query.findTrainer(trainerId);

    // Та же дыра, что и у клуба: удаляли без спроса, а в журнал шёл владелец.
    await this.publications.deleteTrainer(trainerId, ownerCheckFor(session));

    await this.logs.record({
      action: 'publish_delete',
      actorId: session.actor.id,
      actorRole: session.actor.role,
      entityType: 'trainer',
      entityId: trainerId,
      meta: { name: trainer?.name ?? 'unknown' },
    });

    return EMPTY_RESULT;
  }
}

/**
 * Кого сервис должен сверить с владельцем публикации.
 *
 * Для администратора — никого: право модерации разрешает трогать чужие публикации,
 * и требовать от него ещё и владения значило бы запретить модерацию как таковую.
 * Для всех остальных — их самих.
 */
function ownerCheckFor(session: SessionContext): number | undefined {
  return roleCan(session.user.role, 'moderate_publications') ? undefined : session.user.id;
}

export { DomainError };
export const CLUB_CONTROLLERS = [ClubsController, TrainersController];
