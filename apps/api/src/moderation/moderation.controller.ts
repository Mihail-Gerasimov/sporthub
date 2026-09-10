import { accountKindOf } from '@sporthub/domain';
// Модерация публикаций и сводный список для админского раздела.
//
// Скрытие ставит причину, восстановление её снимает. Публикация без явного
// состояния считается опубликованной — так устроены исходные данные.

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import type { CatalogOwnerType, Club, Trainer } from '@sporthub/types';

import { CurrentUser, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { withTopLevel, type TopLevelResult } from '../common/api-response';
import { NotFoundError, ValidationError } from '../common/domain-error';
import { LogService } from '../logs/log.service';
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

/**
 * Порядок списка публикаций: свежие первыми, при равных метках — как раньше.
 *
 * Общий тай-брейкер по номеру здесь НЕ подходит, и это не мелочь. Список склеен
 * из двух коллекций с независимой нумерацией: клуб 1 и тренер 1 — разные записи
 * с одинаковым номером. Сортировка по номеру перемешала бы их между собой,
 * а сегодня склеенный массив стабилен по порядку слияния — сначала все клубы,
 * потом все тренеры, каждая группа по возрастанию номера. Именно это и надо
 * воспроизвести, иначе первая же страница модерации покажет другое.
 */
function comparePublications(
  left: { createdAt: string; type: string; id: number },
  right: { createdAt: string; type: string; id: number },
): number {
  const byDate = right.createdAt.localeCompare(left.createdAt);

  if (byDate !== 0) return byDate;

  // Клубы идут раньше тренеров — таков порядок слияния.
  if (left.type !== right.type) return left.type === 'club' ? -1 : 1;

  return left.id - right.id;
}

@Controller('moderation')
export class ModerationController {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    private readonly logs: LogService,
  ) {}

  // Право проверяет guard: модерация закрыта для всех, кроме тех, кому она положена.
  // Прежняя проверка «а действительно ли этот номер принадлежит админу» больше
  // не нужна — номер не приходит снаружи вовсе.
  @Requires('moderate_publications')
  @Post()
  @HttpCode(HttpStatus.OK)
  async moderate(
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<Club | Trainer> {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const action = body.action;
    const entityType = body.entityType;
    const entityId = body.entityId;
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

    if (action === 'hide' && (typeof reason !== 'string' || !reason.trim())) {
      throw new ValidationError('Причина скрытия обязательна');
    }

    // Скрывший записывается по НАСТОЯЩЕМУ исполнителю: под имперсонизацией
    // в карточке публикации должен остаться след администратора, а не того,
    // от чьего лица он работал.
    const moderatorId = session.actor.id;
    const owner = entityType as CatalogOwnerType;
    const entity =
      action === 'hide'
        ? await this.hide(owner, entityId, (reason as string).trim(), moderatorId)
        : await this.unhide(owner, entityId);

    await this.logs.record({
      action: action === 'hide' ? 'moderation_hide' : 'moderation_unhide',
      actorId: moderatorId,
      actorRole: accountKindOf(session.actor),
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
      // ⚠️ Шаг 36.12. Вид скрытия — признак, а не вывод из текста причины.
      // Прежде архив владельца писал те же четыре поля, и различить их можно было
      // только сравнением причины с константой: стоило владельцу вписать ту же
      // строку руками — и его архив выглядел бы работой модератора.
      hiddenKind: 'moderation' as const,
      // Скрытие начинает разбирательство заново: прежний признак «исправлено,
      // ждёт проверки» к новой причине отношения не имеет.
      awaitingRecheck: false,
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
      // ⚠️ Оба новых поля гасятся здесь же. Забытый признак «ждёт повторной
      // проверки» оставил бы живую публикацию в разделе модерации навсегда,
      // а забытый вид скрытия — показал бы плашку на возвращённой карточке.
      hiddenKind: undefined,
      awaitingRecheck: false,
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

/**
 * Сводный список публикаций админки.
 *
 * ⚠️ Незакрытый хвост, и он назван вслух. Отбор по городу и виду спорта, поиск по
 * названию, сортировка и постраничность ЗДЕСЬ остаются в памяти: список склеен из
 * двух РАЗНЫХ таблиц с независимой нумерацией, и честный перенос требует либо
 * объединения запросом с общим порядком, либо счётных методов у репозиториев клубов
 * и тренеров. Ни того ни другого сейчас нет.
 *
 * Что уже уехало в запрос: отсев скрытых при `status=published` и отказ читать
 * ненужную половину при отборе по типу.
 *
 * Что менять НЕЛЬЗЯ, не сломав выдачу: порядок задаёт `comparePublications`, и он
 * держится на порядке слияния (сначала клубы, потом тренеры). Наивная замена его
 * на общий компаратор уже ломала `GET /api/publications` однажды.
 */
// Сводный список публикаций для раздела модерации: включает СКРЫТЫЕ, причину
// скрытия и номер владельца. До фазы 34 отдавался анонимно.
@Requires('moderate_publications')
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

    const wantsClubs = typeFilter === 'all' || typeFilter === 'club';
    const wantsTrainers = typeFilter === 'all' || typeFilter === 'trainer';
    // Весь отбор — условие запроса. Раньше обе таблицы читались целиком, а состояние,
    // город, вид спорта и поиск отсеивались четырьмя проходами по памяти; сюда доезжала
    // вся платформа ради одной страницы.
    const publicationFilter = {
      ...(statusFilter === 'published' ? { excludeHidden: true } : {}),
      ...(statusFilter === 'hidden' ? { onlyHidden: true } : {}),
      ...(cityFilter ? { city: cityFilter } : {}),
      ...(sportId ? { sportId } : {}),
      ...(search ? { search } : {}),
    };

    // Ненужная половина не читается вовсе: при `type=club` таблица тренеров
    // прежде читалась целиком, чтобы тут же быть выброшенной.
    const [clubs, trainers] = await Promise.all([
      wantsClubs ? this.clubs.findAll(publicationFilter) : Promise.resolve([]),
      wantsTrainers ? this.trainers.findAll(publicationFilter) : Promise.resolve([]),
    ]);

    // ⚠️ Слияние, порядок и срез ОСТАЮТСЯ здесь, и это не недоделка.
    //
    // Клубы и тренеры — разные таблицы с независимыми последовательностями номеров,
    // и честное объединение с постраничностью в запросе (`UNION ALL` поверх двух
    // выборок) заметно дороже пользы при нынешнем размере каталога. А порядок
    // задаёт `comparePublications` и держится на порядке слияния — наивная замена
    // его на общий компаратор уже ломала `GET /api/publications` однажды.
    // Отбор уехал в запрос, поэтому материализуется ровно то, что подошло, а не
    // обе таблицы целиком.
    const items: PublicationItem[] = [...clubs.map(clubToItem), ...trainers.map(trainerToItem)];

    items.sort(comparePublications);

    return withTopLevel(items.slice(offset, offset + limit), {
      total: items.length,
      offset,
      limit,
    });
  }
}

export const MODERATION_CONTROLLERS = [ModerationController, PublicationsController];
