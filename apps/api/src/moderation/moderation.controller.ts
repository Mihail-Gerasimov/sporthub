// Модерация публикаций и сводный список для админского раздела.
//
// Действия модерации — по словарю `MODERATION_ACTION_SPECS` из `@sporthub/domain`
// (шаг 38.38): скрытие ставит причину, восстановление её снимает, и всё, чем
// действия отличаются, записано там одной строкой на действие. Публикация без
// явного состояния считается опубликованной — так устроены исходные данные.

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import {
  MODERATION_ACTION_SPECS,
  MODERATION_ERRORS,
  accountKindOf,
  isModerationAction,
  notificationPayload,
  type ModerationPrecondition,
} from '@sporthub/domain';
import {
  CATALOG_OWNER_TYPES,
  type CatalogOwnerType,
  type Club,
  type HideKindValue,
  type NotificationType,
  type Trainer,
} from '@sporthub/types';

import { CurrentUser, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { withTopLevel, type TopLevelResult } from '../common/api-response';
import { NotFoundError, ValidationError } from '../common/domain-error';
import { LogService } from '../logs/log.service';
import {
  NotificationService,
  faceRecipient,
  supervisionRecipient,
} from '../notifications/notification.service';
import { PublicationService } from '../publications/publication.service';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';

/** Текст «не найдено» по виду владельца — как и прежде, у каждого свой. */
const NOT_FOUND_BY_KIND: Record<CatalogOwnerType, string> = {
  club: 'Клуб не найден',
  trainer: 'Тренер не найден',
};

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
  /**
   * Вид скрытия: архив владельца или скрытие модератором (шаг 36.12).
   *
   * ⚠️ Раздел модерации без этого поля различал бы их только сравнением текста
   * причины с константой — то есть не различал бы вовсе: владельцу достаточно
   * вписать ту же строку руками.
   */
  hiddenKind?: HideKindValue;
  /** Владелец исправил скрытую публикацию, она ждёт повторной проверки (36.20). */
  awaitingRecheck?: boolean;
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
    hiddenKind: club.hiddenKind,
    awaitingRecheck: club.awaitingRecheck,
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
    hiddenKind: trainer.hiddenKind,
    awaitingRecheck: trainer.awaitingRecheck,
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
    private readonly publications: PublicationService,
    // Очередь надзора: о скрытии публикации должен узнать не только тот, кто скрыл.
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Проверки по данным, названные в словаре действий (`precondition`).
   *
   * Карта, а не ветвление: новое имя условия в словаре компилятор потребует
   * реализовать здесь. `no_live_bookings` — тот же запрет, что у уборки лица
   * (36.19, решение 14), и живёт он в сервисе публикаций: вторая копия здесь
   * разошлась бы с первой при первой же правке набора действующих статусов.
   */
  private readonly preconditions: Record<
    ModerationPrecondition,
    (owner: { kind: CatalogOwnerType; id: number }) => Promise<void>
  > = {
    no_live_bookings: (owner) => this.publications.assertCanHide(owner),
  };

  /**
   * Одно действие модерации — по строке словаря (шаг 38.39).
   *
   * ⚠️ Здесь НЕТ ветвления по действию, и это стережёт `moderation-dictionary-guard`.
   * До этого шага контроллер ветвился в восьми местах; всё, чем действия
   * отличаются, теперь в `MODERATION_ACTION_SPECS`, а здесь — одна и та же
   * последовательность для любого из них: разбор тела, причина, если нужна,
   * условие, если названо, запись, журнал, надзорная строка, письмо владельцу.
   *
   * Право проверяет guard: модерация закрыта для всех, кроме тех, кому она положена.
   */
  @Requires('moderate_publications')
  @Post()
  @HttpCode(HttpStatus.OK)
  async moderate(
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<Club | Trainer> {
    const body = (rawBody ?? {}) as Record<string, unknown>;

    // Проверки идут по одной, каждая со своим текстом из словаря.
    if (!isModerationAction(body.action)) {
      throw new ValidationError(MODERATION_ERRORS.unknownAction);
    }

    const spec = MODERATION_ACTION_SPECS[body.action];
    const entityType = body.entityType;

    if (
      typeof entityType !== 'string' ||
      !(CATALOG_OWNER_TYPES as readonly string[]).includes(entityType)
    ) {
      throw new ValidationError(MODERATION_ERRORS.unknownEntityType);
    }

    const entityId = body.entityId;

    if (typeof entityId !== 'number' || !entityId) {
      throw new ValidationError(MODERATION_ERRORS.invalidEntityId);
    }

    // Причина читается только там, где словарь её требует: у остальных действий
    // присланная строка не попадает ни в запись, ни в журнал, ни в письмо.
    const trimmedReason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (spec.requiresReason !== false && trimmedReason === '') {
      throw new ValidationError(spec.requiresReason);
    }

    const reason = spec.requiresReason === false ? undefined : trimmedReason;
    const owner = { kind: entityType as CatalogOwnerType, id: entityId };

    await this.requirePublication(owner);

    if (spec.precondition !== null) {
      await this.preconditions[spec.precondition](owner);
    }

    // Исполнитель — НАСТОЯЩИЙ: под работой от чужого лица в карточке публикации
    // должен остаться след администратора, а не того, от чьего лица он работал.
    const moderatorId = session.actor.id;
    const entity = await this.repositoryOf(owner.kind).update(
      owner.id,
      spec.patch({ reason, actorId: moderatorId, now: new Date() }),
    );

    await this.logs.record({
      action: spec.logAction,
      actorId: moderatorId,
      actorRole: accountKindOf(session.actor),
      entityType: owner.kind,
      entityId: owner.id,
      meta: { name: entity.name, ...(reason === undefined ? {} : { reason }) },
    });

    // ⚠️ Шаг 37.31. Наложение ограничения уходит в ОБЩУЮ ОЧЕРЕДЬ НАДЗОРА, а не
    // отдельному человеку: двое администраторов, не зная о решениях друг друга,
    // способны отменять их по очереди. Снятие ограничения строки не порождает —
    // какие действия что порождают, говорит словарь.
    //
    // Исполнитель в надзорной строке — `actorUserId`, как у остальных надзорных
    // событий (`admin.controller.ts`). Прежний ключ `hiddenByUserId` у скрытия
    // не читал никто; одно имя на все действия — и читателю не гадать.
    if (spec.oversightType !== null) {
      await this.notifications.notify(
        supervisionRecipient,
        spec.oversightType,
        notificationPayload(spec.oversightType, owner.kind, owner.id, {
          publicationName: entity.name,
          reason,
          actorUserId: moderatorId,
        }),
      );
    }

    await this.notifyOwnerOfDecision(spec.ownerNoticeType, owner.kind, entity, reason);

    return entity;
  }

  /**
   * Известить ВЛАДЕЛЬЦА о решении по его публикации (довесок к фазе 37).
   *
   * ⚠️ Зачем понадобилось. До этого владелец узнавал о скрытии, только если сам
   * заходил на свою карточку и видел плашку. То есть публикации нет в каталоге,
   * записи не идут — а человек об этом не знает и ждёт. Плашка отвечает тому,
   * кто пришёл спросить; письмо приходит само.
   *
   * ⚠️ Адресат — ЛИЦО УСЛУГ, а не человек. У владельца трёх клубов письмо приходит
   * в ящик того клуба, чью публикацию тронули: иначе три решения по трём разным
   * клубам легли бы в одну кучу, и разобрать, к какому относится причина, было бы
   * нечем (модель фазы 35).
   *
   * ⚠️ Имя администратора НЕ называется — решение заказчика. Владельцу важна причина,
   * а не фамилия; имя превращает административное решение в личный конфликт.
   * В журнале и в очереди надзора исполнитель остаётся.
   *
   * ⚠️ Возврат публикации уведомляет ТОЖЕ. Иначе человек, исправивший нарушение,
   * не узнает, что его вернули, и продолжит ждать — молчание здесь читается как отказ.
   *
   * Отключить эти типы нельзя (`REQUIRED_NOTIFICATION_TYPES`): это не новость
   * площадки, а факт, меняющий работу человека.
   */
  private async notifyOwnerOfDecision(
    type: NotificationType,
    owner: CatalogOwnerType,
    entity: Club | Trainer,
    reason: string | undefined,
  ): Promise<void> {
    // У лица из сида владельца может не быть вовсе — тогда писать некому,
    // и `faceRecipient` честно возвращает `null` (правило фазы 35).
    const recipient = faceRecipient(owner, entity);

    if (recipient === null) return;

    await this.notifications.notify(
      recipient,
      type,
      notificationPayload(type, owner, entity.id, {
        publicationName: entity.name,
        // Причина есть там, где словарь её требует, и обязательна там: без неё
        // письмо не отвечает на единственный вопрос, который у человека возникнет.
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  }

  /** Репозиторий по виду владельца — карта, а не ветвление. */
  private repositoryOf(kind: CatalogOwnerType): ClubsRepository | TrainersRepository {
    return kind === 'club' ? this.clubs : this.trainers;
  }

  /** Публикация обязана существовать; текст отказа — по виду, как и прежде. */
  private async requirePublication(owner: { kind: CatalogOwnerType; id: number }): Promise<void> {
    if ((await this.repositoryOf(owner.kind).findById(owner.id)) === null) {
      throw new NotFoundError(NOT_FOUND_BY_KIND[owner.kind]);
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
    // ⚠️ Шаг 36.22. Параметр НЕОБЯЗАТЕЛЬНЫЙ: клиент, ничего о нём не знающий,
    // обязан получить ровно ту же выдачу, что получал до выкатки.
    @Query('awaitingRecheck') rawAwaitingRecheck?: string,
    // ⚠️ Шаг 37.54. Наводка на ОДНУ публикацию — быстрый переход из надзорной ленты.
    // Параметр необязательный: клиент, ничего о нём не знающий, получает прежнюю
    // выдачу. Номер, а не слаг: в уведомлении лежит именно номер, а перевод его
    // в слаг означал бы лишний поход в базу ради ссылки.
    @Query('id') rawFocusId?: string,
    @Query('offset') rawOffset?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<TopLevelResult<PublicationItem[]>> {
    const statusFilter = status ?? 'all';
    const typeFilter = type ?? 'all';
    const cityFilter = city ?? '';
    const sportId = rawSportId ? Number(rawSportId) : null;
    const search = (rawSearch ?? '').trim().toLowerCase();
    // Отбор включается ровно строкой `true`. «Ложь» и мусор означают одно и то же —
    // отбора нет: среза «покажи всё, что проверять не надо» никто не спрашивает,
    // и заводить его молча, из-за случайной строки в адресе, нельзя.
    const onlyAwaitingRecheck = rawAwaitingRecheck === 'true';
    // Мусор в параметре означает его отсутствие: страница не падает, а показывает
    // обычную выдачу. Показать вместо наведённой публикации ВСЮ выдачу молча —
    // единственная альтернатива, и она хуже: опечатку в адресе никто не заметит,
    // поэтому раздел о ненайденной публикации говорит вслух.
    const focusId = Number(rawFocusId);
    const focus = Number.isInteger(focusId) && focusId > 0 ? focusId : undefined;
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
      // Очередь повторной проверки уходит В ЗАПРОС: под неё заведён частичный
      // индекс `clubs_awaiting_recheck_idx` / `trainers_awaiting_recheck_idx`.
      ...(onlyAwaitingRecheck ? { awaitingRecheck: true } : {}),
      // ⚠️ Наводка СУЖАЕТ выдачу до одной строки и делает это в запросе.
      // Читать страницу целиком, чтобы найти в ней одну публикацию, — ровно тот
      // отбор в памяти, от которого ушёл шаг 36.х.
      ...(focus === undefined ? {} : { ids: [focus] }),
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
