// Контроллеры клубов и тренеров.
//
// Самая большая группа маршрутов: публичная выдача с фильтрами, детальная
// карточка, публикация, правка и удаление.
//
// ⚠️ Фаза 38, шаг 38.23: надёжность вырезана целиком (решение заказчика 15.09.2026).
// Из выдачи ушли поле `reliability`, отсев `excludeDanger` и сортировка
// `sort=reliability` с направлением `dir`. Сортировка по рейтингу заводится
// отдельно, шагом 38.29 — уже в запросе, а не в памяти.
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
// ⚠️ Шаг 35.17 показал обратную сторону того разделения: роль в данных и роль
// в правах — разные вещи. Карточками тренера владеют и представители услуг
// (в живой базе четыре из одиннадцати), и собственная карточка отвечала хозяину
// «Недостаточно прав». Поэтому правка и удаление помечены `@OrOwnerOf`: владелец
// проходит независимо от роли, а посторонний по-прежнему упирается либо в право,
// либо в проверку владения внутри сервиса. Создание пометки не получает — у
// несуществующей публикации владельца нет, и решается это отдельно (шаг 35.19c).
//
// ⚠️ Правка клуба и тренера подменяет текст ошибки: любое «не найдено» изнутри
// (сама сущность, основная услуга, слот) выходит наружу как общее «Клуб не найден».
// Это вводит в заблуждение, но покрыто тестами и потому сохранено дословно.

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  notificationPayload,
  editClubSchema,
  editTrainerSchema,
  publishClubSchema,
  publishTrainerSchema,
  accountCan,
  accountKindOf,
  hasHumanAbilities,
} from '@sporthub/domain';

import { AccessService } from '../access/access.service';
import { CurrentUser, OrOwnerOf, Public, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../common/domain-error';
import { CatalogQueryService } from './catalog-query.service';
import type { PublicClub, PublicTrainer } from './public-view';
import { LogService } from '../logs/log.service';
import { NotificationService, supervisionRecipient } from '../notifications/notification.service';
import {
  type PublicationActor,
  PublicationService,
  type PublicationRemoval,
} from '../publications/publication.service';

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

/**
 * Ответ на уборку лица услуг.
 *
 * ⚠️ Исход называется явно, потому что исходов два и они разные по необратимости:
 * `archived` — публикация ушла из каталога, записи, отзывы и связи целы, вернуть
 * можно; `deleted` — стёрта каскадом, поднимать нечего. Прежний ответ
 * `{ success: true }` называл оба одним словом.
 */
type PublicationRemovalResult = { outcome: PublicationRemoval };

/**
 * Отказ по видимости скрытой публикации (шаг 36.13, решения заказчика 3–5).
 *
 * ⚠️ Именно **404**, а не 403. Отказ по правам сообщает, что публикация существует,
 * и по нему её можно перечислить; для того, кто её видеть не должен, её не существует
 * вовсе. Текст — тот же, что у настоящего отсутствия: иначе разница в формулировке
 * рассказала бы ровно то, что мы скрываем.
 *
 * ⚠️ Проверка стоит ПОСЛЕ загрузки публикации по необходимости — раньше неоткуда
 * узнать её статус и владельца, — но ДО возврата тела наружу. Данные не попадают
 * в поток ответа ни при каком исходе.
 */
/**
 * Учитывать ли флаг «показать скрытые» (шаг 36.14, решение заказчика 3).
 *
 * ⚠️ Флаг был открыт кому угодно. Проверено на живом приложении 10.09.2026:
 * гость получал скрытые публикации вместе с `hideReason`, `hiddenByUserId`
 * (номером администратора) и `hiddenAt`.
 *
 * ⚠️ Названный отказ 403 здесь ЗАПРЕЩЁН, и это не мягкость. `server-api.ts` во фронте
 * слал этот флаг БЕЗУСЛОВНО, и через него ходили публичная страница клуба, страница
 * тренера и разделы личного кабинета: отказ превратил бы их в 500 у гостя. Такое
 * уже случалось и записано в коде — `links.controller.ts:126-129`, «закрыв маршрут
 * целиком, фаза сломала публичную витрину».
 *
 * Поэтому для не-модератора флаг **сужает выдачу до опубликованных**, а не отказывает:
 * старый клиент переживает выкатку, чего Главное правило и требует от параметров API.
 * Вторая половина решения — во фронте: публичные страницы флаг больше не шлют вовсе.
 */
async function mayIncludeHidden(
  access: AccessService,
  includeHidden: string | undefined,
  session: SessionContext | undefined,
): Promise<boolean> {
  if (includeHidden !== 'true' || session === undefined) {
    return false;
  }

  return access.isAdmin(session.user.id);
}

async function assertVisible(
  access: AccessService,
  entity: { status?: string } | null | undefined,
  owner: { kind: 'club'; id: number } | { kind: 'trainer'; id: number },
  session: SessionContext | undefined,
  notFoundMessage: string,
): Promise<void> {
  if (entity === null || entity === undefined) {
    throw new NotFoundError(notFoundMessage);
  }

  if (entity.status !== 'hidden') {
    return;
  }

  if (!(await access.canSeeHiddenPublication(owner, session?.user.id))) {
    throw new NotFoundError(notFoundMessage);
  }
}

@Controller('clubs')
export class ClubsController {
  constructor(
    private readonly query: CatalogQueryService,
    private readonly publications: PublicationService,
    private readonly logs: LogService,
    private readonly access: AccessService,
    // Очередь надзора: премодерации нет, и появление нового лица в каталоге —
    // единственная точка, где надзор может его увидеть (шаг 37.33).
    private readonly notifications: NotificationService,
  ) {}

  /** См. `mayIncludeHidden`: флаг «показать скрытые» учитывается только модератору. */
  private mayIncludeHidden(
    includeHidden: string | undefined,
    session: SessionContext | undefined,
  ): Promise<boolean> {
    return mayIncludeHidden(this.access, includeHidden, session);
  }

  // Открыто гостю: список клубов с фильтрами — это сама витрина площадки.
  // Человек должен найти свой клуб и решить, стоит ли ради него заводить учётку;
  // требование входа означало бы «сначала зарегистрируйся, потом посмотри, что тут есть».
  @Public()
  @Get()
  async findMany(
    @Query('sportId') sportId?: string,
    @Query('search') search?: string,
    @Query('minRating') minRating?: string,
    @Query('includeHidden') includeHidden?: string,
    @CurrentUser() session?: SessionContext,
  ): Promise<PublicClub[]> {
    const rating = minRating === undefined || minRating === '' ? undefined : Number(minRating);

    if (rating !== undefined && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    return this.query.findPublishedClubs({
      sportId: parseOptionalNumber(sportId),
      search: search?.trim() || undefined,
      minRating: rating,
      includeHidden: await this.mayIncludeHidden(includeHidden, session),
      // Владелец видит свои скрытые публикации и в общей выдаче: кабинет читает
      // каталог этим же маршрутом, и без этого исключения он показал бы владельцу
      // на одну публикацию меньше, чем у него есть.
      includeHiddenOwnedBy: includeHidden === 'true' ? session?.user.id : undefined,
    });
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
  async findOneBySlug(
    @Param('slug') slug: string,
    @CurrentUser() session?: SessionContext,
  ): Promise<unknown> {
    const club = await this.query.findClubBySlug(slug);

    await assertVisible(
      this.access,
      club,
      { kind: 'club', id: club?.id ?? 0 },
      session,
      'Клуб не найден',
    );

    return this.query.getClubDetail(club!.id);
  }

  // Открыто гостю: карточка клуба — расписание, услуги, отзывы, адрес на карте.
  // Это то, ради чего на площадку заходят, и закрывать её от незарегистрированного
  // значит закрывать площадку.
  @Public()
  @Get(':id')
  async findOne(
    @Param('id') rawId: string,
    @CurrentUser() session?: SessionContext,
  ): Promise<unknown> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    // Приведение к известной форме: сервис объявляет ответ как `unknown`,
    // а статус публикации нужен здесь и лежит в нём же. Отдельным запросом
    // за статусом идти незачем — это те же строки, только вторым чтением.
    const detail = (await this.query.getClubDetail(clubId)) as {
      club?: { status?: string };
    } | null;

    await assertVisible(
      this.access,
      detail === null ? null : detail.club,
      { kind: 'club', id: clubId },
      session,
      'Клуб не найден',
    );

    return detail;
  }

  @Post()
  async create(@Body() rawBody: unknown, @CurrentUser() session: SessionContext): Promise<unknown> {
    // ⚠️ Проверка стоит ДО разбора тела, и порядок здесь существенный. Она
    // не зависит от тела вовсе: «человек ли это» известно из сессии. Стоя ниже,
    // она отдавала администратору 400 со списком незаполненных полей — подсказку
    // по форме, к которой у него доступа нет. Хуже другое: тест такого запрета
    // легко зеленеет по 400, ни разу не дойдя до самой проверки, — ровно тот вид
    // ложного зелёного, ради которого фаза завела «тихие» диверсии.
    // ⚠️ Шаг 35.18a, решение заказчика 13. Лицо услуг заводит человек площадки.
    // Администратор им не является: он за площадкой следит, а не работает на ней.
    // Правки и удаления это НЕ касается — там законна модерация.
    if (!hasHumanAbilities(accountKindOf(session.user))) {
      throw new ForbiddenError('Публикации заводят пользователи площадки');
    }

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
      // Исполнитель — тот, кто ВОШЁЛ, а не тот, от чьего лица работают: владелец
      // публикации и так записан в ней самой, а журналу нужен автор действия.
      // Роль берётся оттуда же: после разделения прав клуб публикует представитель
      // услуг, карточку тренера — тренер, а под имперсонизацией — администратор.
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'club',
      entityId: result.club.id,
      meta: { name: result.club.name, city: result.club.city },
    });

    // ⚠️ Шаг 37.33. Премодерации в продукте НЕТ: публикация встаёт в каталог сразу
    // `published` — значит первый и единственный взгляд надзора на новую карточку
    // возможен только постфактум. Без этой строки надзор узнаёт о ней, лишь когда
    // придёт жалоба, которой в продукте тоже не существует.
    await this.notifications.notify(
      supervisionRecipient,
      'oversight_publication_created',
      notificationPayload('oversight_publication_created', 'club', result.club.id, {
        publicationName: result.club.name,
      }),
    );

    return result;
  }

  @OrOwnerOf('club')
  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<unknown> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    // ⚠️ Схема ПРАВКИ, а не создания (шаг 36.6, решение заказчика 1). Отличие
    // ровно одно: расписания может не быть, и тогда сервер его не трогает.
    // Смягчить общую схему было нельзя — это разрешило бы создать публикацию
    // без расписания, и она вышла бы в каталог нерабочей.
    const parsed = editClubSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные клуба',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    const { userId: _ignoredUserId, ...form } = parsed.data;
    const userId = session.user.id;
    await this.query.rememberCity(form.city, form.cityCoordinates);

    try {
      const result = await this.publications.updateClubFromForm(form, clubId, userId);

      await this.logs.record({
        action: 'publish_update',
        actorId: session.actor.id,
        actorRole: accountKindOf(session.actor),
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

  @Requires('moderate_publications')
  @OrOwnerOf('club')
  @Delete(':id')
  async remove(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<PublicationRemovalResult> {
    const clubId = parseId(rawId, 'Некорректный идентификатор клуба');
    const club = await this.query.findClub(clubId);

    // ⚠️ До фазы 34 маршрут не читал тело вовсе и не спрашивал, кто удаляет:
    // снести чужую публикацию вместе со всеми записями мог кто угодно. А в журнал
    // при этом писался владелец сущности — в аудите удаление выглядело его действием.
    //
    // Владельца сверяет сервис: выдача каталога поле владельца наружу не отдаёт,
    // и проверка по ней отказывала бы всегда. Администратору владелец не важен —
    // ему это разрешает право модерации.
    // ⚠️ Шаг 35.24a: у владельца это АРХИВ, у модератора — стирание. Что именно
    // произошло, решает сервис, а маршрут только записывает исход в журнал:
    // событие «убрана из каталога» и событие «стёрта» — разные, и аудит,
    // называющий их одним словом, врёт о необратимости действия.
    const outcome = await this.publications.removeClub(clubId, publicationActor(session));

    await this.logs.record({
      action: outcome === 'archived' ? 'publish_archive' : 'publish_delete',
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'club',
      entityId: clubId,
      meta: { name: club?.name ?? 'unknown' },
    });

    // ⚠️ Шаг 37.32. Надзорная строка только на СТИРАНИЕ, не на архив.
    // Архив — обратимое действие владельца со своей вещью, и запрет при живых
    // записях на нём уже стоит. Стирание необратимо и уносит каскадом услуги,
    // расписание, чужие записи и отзывы — о нём надзор обязан узнать.
    if (outcome === 'deleted') {
      await this.notifications.notify(
        supervisionRecipient,
        'oversight_publication_deleted',
        notificationPayload('oversight_publication_deleted', 'club', clubId, {
          publicationName: club?.name ?? '',
        }),
      );
    }

    // ⚠️ Исход возвращается КЛИЕНТУ, а не только пишется в журнал.
    //
    // Исходов два, и они разные по последствиям: владелец лицо АРХИВИРУЕТ —
    // публикация уходит из каталога, а записи, отзывы и связи целы и её можно
    // вернуть; модератор СТИРАЕТ — обратно ничего не поднимется. Ответ
    // `{ success: true }` называл оба одним словом, и клиент не мог ни показать
    // верное сообщение, ни предложить возврат: чтобы узнать, что произошло,
    // приходилось идти в базу или в журнал. Найдено прогоном чек-листа
    // безопасности 10.09.2026.
    return { outcome };
  }
}

@Controller('trainers')
export class TrainersController {
  constructor(
    private readonly query: CatalogQueryService,
    private readonly publications: PublicationService,
    private readonly logs: LogService,
    private readonly access: AccessService,
    // Очередь надзора: премодерации нет, и появление нового лица в каталоге —
    // единственная точка, где надзор может его увидеть (шаг 37.33).
    private readonly notifications: NotificationService,
  ) {}

  /** См. `mayIncludeHidden`: флаг «показать скрытые» учитывается только модератору. */
  private mayIncludeHidden(
    includeHidden: string | undefined,
    session: SessionContext | undefined,
  ): Promise<boolean> {
    return mayIncludeHidden(this.access, includeHidden, session);
  }

  // Открыто гостю: та же витрина, только тренеры. Подбор тренера идёт до входа,
  // а не после.
  @Public()
  @Get()
  async findMany(
    @Query('affiliatedClubId') affiliatedClubId?: string,
    @Query('clubId') clubId?: string,
    @Query('sportId') sportId?: string,
    @Query('includeHidden') includeHidden?: string,
    @CurrentUser() session?: SessionContext,
  ): Promise<PublicTrainer[]> {
    const trainers = await this.query.findPublishedTrainers({
      // Оба имени параметра поддерживаются — так было до переноса.
      clubId: parseOptionalNumber(affiliatedClubId) ?? parseOptionalNumber(clubId),
      sportId: parseOptionalNumber(sportId),
      includeHidden: await this.mayIncludeHidden(includeHidden, session),
      includeHiddenOwnedBy: includeHidden === 'true' ? session?.user.id : undefined,
    });

    // Умолчание: по рейтингу, при равенстве — по числу отзывов. Порядок пока
    // наводится в памяти — так было до фазы 38; в запрос он уезжает шагом 38.29
    // вместе с `limit`, и тогда же эта строка исчезнет.
    return trainers.sort((left, right) =>
      right.rating !== left.rating
        ? right.rating - left.rating
        : right.reviewCount - left.reviewCount,
    );
  }

  // Открыто гостю: адрес-ссылка тренера — та же ссылка из поиска и переписки.
  @Public()
  @Get('by-slug/:slug')
  async findOneBySlug(
    @Param('slug') slug: string,
    @CurrentUser() session?: SessionContext,
  ): Promise<unknown> {
    const trainer = await this.query.findTrainerBySlug(slug);

    await assertVisible(
      this.access,
      trainer,
      { kind: 'trainer', id: trainer?.id ?? 0 },
      session,
      'Тренер не найден',
    );

    return this.query.getTrainerDetail(trainer!.id);
  }

  // Открыто гостю: карточка тренера — специализации, цены, свободные слоты.
  // Гость выбирает, к кому идти, и только потом заводит учётку ради записи.
  @Public()
  @Get(':id')
  async findOne(
    @Param('id') rawId: string,
    @CurrentUser() session?: SessionContext,
  ): Promise<unknown> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    // См. пояснение у карточки клуба: форма ответа объявлена как `unknown`.
    const detail = (await this.query.getTrainerDetail(trainerId)) as {
      trainer?: { status?: string };
    } | null;

    await assertVisible(
      this.access,
      detail === null ? null : detail.trainer,
      { kind: 'trainer', id: trainerId },
      session,
      'Тренер не найден',
    );

    return detail;
  }

  @Post()
  async create(@Body() rawBody: unknown, @CurrentUser() session: SessionContext): Promise<unknown> {
    // ⚠️ Проверка стоит ДО разбора тела, и порядок здесь существенный. Она
    // не зависит от тела вовсе: «человек ли это» известно из сессии. Стоя ниже,
    // она отдавала администратору 400 со списком незаполненных полей — подсказку
    // по форме, к которой у него доступа нет. Хуже другое: тест такого запрета
    // легко зеленеет по 400, ни разу не дойдя до самой проверки, — ровно тот вид
    // ложного зелёного, ради которого фаза завела «тихие» диверсии.
    // ⚠️ Шаг 35.18a, решение заказчика 13. Лицо услуг заводит человек площадки.
    // Администратор им не является: он за площадкой следит, а не работает на ней.
    // Правки и удаления это НЕ касается — там законна модерация.
    if (!hasHumanAbilities(accountKindOf(session.user))) {
      throw new ForbiddenError('Публикации заводят пользователи площадки');
    }

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
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'trainer',
      entityId: result.trainer.id,
      meta: { name: result.trainer.name, city: result.trainer.city },
    });

    // Шаг 37.33: то же, что у клуба. Премодерации нет, карточка видна людям сразу.
    await this.notifications.notify(
      supervisionRecipient,
      'oversight_publication_created',
      notificationPayload('oversight_publication_created', 'trainer', result.trainer.id, {
        publicationName: result.trainer.name,
      }),
    );

    return result;
  }

  @OrOwnerOf('trainer')
  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<unknown> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    // Схема ПРАВКИ — см. пояснение у правки клуба (шаг 36.6).
    const parsed = editTrainerSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        'Некорректные данные тренера',
        parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
      );
    }

    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    // Владелец — из сессии. Одноимённое поле в теле сервер игнорирует: до фазы 34
    // именно оно и решало, от чьего имени публикуется клуб или тренер.
    const { userId: _ignoredUserId, ...form } = parsed.data;
    const userId = session.user.id;
    await this.query.rememberCity(form.city, form.cityCoordinates);

    try {
      const result = await this.publications.updateTrainerFromForm(form, trainerId, userId);

      await this.logs.record({
        action: 'publish_update',
        actorId: session.actor.id,
        actorRole: accountKindOf(session.actor),
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

  @Requires('moderate_publications')
  @OrOwnerOf('trainer')
  @Delete(':id')
  async remove(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<PublicationRemovalResult> {
    const trainerId = parseId(rawId, 'Некорректный идентификатор тренера');
    const trainer = await this.query.findTrainer(trainerId);

    // Та же дыра, что и у клуба: удаляли без спроса, а в журнал шёл владелец.
    const outcome = await this.publications.removeTrainer(trainerId, publicationActor(session));

    await this.logs.record({
      action: outcome === 'archived' ? 'publish_archive' : 'publish_delete',
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'trainer',
      entityId: trainerId,
      meta: { name: trainer?.name ?? 'unknown' },
    });

    // Шаг 37.32: только стирание, не архив — по той же причине, что у клуба.
    if (outcome === 'deleted') {
      await this.notifications.notify(
        supervisionRecipient,
        'oversight_publication_deleted',
        notificationPayload('oversight_publication_deleted', 'trainer', trainerId, {
          publicationName: trainer?.name ?? '',
        }),
      );
    }

    // Исход — как у клуба: архив владельца и стирание модератора различаются
    // необратимостью, и клиент обязан знать, что именно произошло.
    return { outcome };
  }
}

/**
 * От чьего лица идёт удаление публикации.
 *
 * ⚠️ Шаг 35.25. Прежняя форма возвращала «номер или ничего», и `undefined` означал
 * «владельца не сверять». Отключить защиту можно было, просто не передав аргумент.
 * Теперь намерение названо вслух, и «модератор» — это отдельное значение, а не
 * отсутствие значения.
 *
 * Модерация не отменяет владение, а даёт вторую причину: право трогать чужие
 * публикации есть у того, кому его выдали. Требовать от модератора ещё и владения
 * значило бы запретить модерацию как таковую.
 */
function publicationActor(session: SessionContext): PublicationActor {
  return accountCan(accountKindOf(session.user), 'moderate_publications')
    ? { kind: 'moderator' }
    : { kind: 'owner', userId: session.user.id };
}

export { DomainError };
export const CLUB_CONTROLLERS = [ClubsController, TrainersController];
