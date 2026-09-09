// Контроллеры связей тренер↔клуб.
//
// Роль в журнале записывается по стороне, принявшей решение: клуб пишется как
// `club_owner`, тренер — как `trainer`. Разрыв администратором пишется как
// `admin`, обычный разрыв — всегда как `club_owner`, даже когда его сделал
// тренер. Последнее выглядит ошибкой, но так писалось раньше и на этом стоят
// выборки журнала, поэтому сохранено.
//
// Фаза 34: номер действующего больше не приходит в теле запроса — он берётся
// из серверной сессии. Проверки прав в `LinkService` при этом не изменились:
// они и раньше были правильными («решает сторона, противоположная инициатору»),
// им не хватало только честного источника личности.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { compareByCreatedAtDesc, accountCan, accountKindOf } from '@sporthub/domain';
import type { TrainerClubLink, TrainerClubLinkStatus } from '@sporthub/types';
import { z } from 'zod';

import { CurrentUser, Public, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ValidationError } from '../common/domain-error';
import { LogService } from '../logs/log.service';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import { LinkService } from './link.service';

// ⚠️ Схемы тела намеренно НЕ строгие. Поле `userId` из них ушло, но старый клиент
// продолжает его слать до перевода фронта на сессию; строгий разбор отвечал бы ему
// 400 на каждое действие. Незнакомые ключи молча отбрасываются — подставить чужой
// номер через них нельзя, потому что личность читается только из сессии.
const createSchema = z.object({
  trainerId: z.number().int().positive(),
  clubId: z.number().int().positive(),
  initiatedBy: z.enum(['trainer', 'club']).optional(),
});

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const LINK_STATUSES = ['pending', 'confirmed', 'rejected', 'revoked'];

/** Отбор связей — тот же набор полей, что понимает репозиторий. */
type LinkFilter = {
  trainerId?: number;
  clubId?: number;
  status?: TrainerClubLinkStatus;
};

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

/**
 * Склейка нескольких выдач в один порядок «свежие первыми».
 *
 * Порядок повторяет тот, которым отдаёт связи репозиторий (`createdAt` по убыванию,
 * тай-брейкер по номеру): выдача, собранная из нескольких запросов, обязана выглядеть
 * так же, как выдача одного. Повторы неизбежны и убираются по номеру — связь,
 * у которой обе стороны принадлежат одному человеку, приходит и по клубу, и по тренеру.
 */
function mergeNewestFirst(batches: TrainerClubLink[][]): TrainerClubLink[] {
  const byId = new Map<number, TrainerClubLink>();

  for (const batch of batches) {
    for (const link of batch) byId.set(link.id, link);
  }

  return [...byId.values()].sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id,
  );
}

@Controller('trainer-club-links')
export class TrainerClubLinksController {
  constructor(
    private readonly links: LinkService,
    private readonly logs: LogService,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
  ) {}

  /**
   * Список связей.
   *
   * ⚠️ До фазы 34 этот маршрут отдавал БЕЗ ВХОДА все связи платформы разом —
   * вместе с состояниями и причинами отказов, то есть перепиской двух сторон.
   *
   * Ширина выдачи теперь зависит от того, кто спрашивает:
   *
   * - **гость** видит только ПОДТВЕРЖДЁННЫЕ связи. Это публичный факт: карточка
   *   клуба показывает своих тренеров, карточка тренера — свой клуб, и главная
   *   страница собирает то же самое. Заявки, отказы и их причины гостю не видны;
   * - **вошедший** видит подтверждённые плюс свои — те, где он сторона;
   * - **администратор** видит всё: разбор споров без этого невозможен.
   *
   * Права `manage_own_links` здесь нет намеренно: администратору оно не положено
   * (своих связей он не ведёт), а весь срез платформы ему нужен.
   *
   * ⚠️ Маршрут открыт гостю не «заодно». Закрыв его целиком, фаза сломала публичную
   * витрину: главная падала пятисоткой, потому что карточки тренеров показывают
   * привязку к клубу. Нашлось это только на поднятом приложении — ни один тест
   * такого не ловил, и поэтому здесь же появилась проверка на гостя.
   */
  @Public()
  @Get()
  async findMany(
    @CurrentUser() session: SessionContext | undefined,
    @Query('trainerId') trainerId?: string,
    @Query('clubId') clubId?: string,
    @Query('status') status?: string,
  ): Promise<TrainerClubLink[]> {
    if (status !== undefined && !LINK_STATUSES.includes(status)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const filter: LinkFilter = {
      trainerId: parseOptionalId(trainerId),
      clubId: parseOptionalId(clubId),
      status: status as TrainerClubLinkStatus | undefined,
    };

    // Полный срез — служебное чтение, и оно осталось ровно у той роли, которой
    // положены служебные действия.
    if (session !== undefined && accountCan(accountKindOf(session.user), 'use_admin_tools')) {
      return this.links.list(filter);
    }

    // Подтверждённые связи публичны: их и так видно на карточках клуба и тренера.
    const confirmed = await this.links.list({ ...filter, status: 'confirmed' });

    if (session === undefined) return confirmed;

    const own = await this.listOwn(session.user.id, filter);
    const byId = new Map(confirmed.map((link) => [link.id, link]));

    for (const link of own) byId.set(link.id, link);

    // Порядок общий для обеих половин: иначе выдача зависела бы от того, вошёл
    // ли спрашивающий, — а это уже разное поведение на одних и тех же данных.
    return [...byId.values()].sort(compareByCreatedAtDesc);
  }

  @Post()
  async create(
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<TrainerClubLink> {
    const parsed = createSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    // Сторона заявки — тот, от чьего лица действуют; проверку «его ли это клуб
    // или тренер» делает сервис, ему нужен только честный номер.
    const { link, initiatedBy } = await this.links.create({
      ...parsed.data,
      userId: session.user.id,
    });

    await this.logs.record({
      action: 'link_request',
      // Журнал пишется по НАСТОЯЩЕМУ исполнителю: под имперсонизацией след
      // администратора теряться не должен. Роль — его же: сторона заявки
      // (`initiatedBy`) живёт в `meta` и ролью исполнителя не является.
      actorId: session.actor.id,
      actorRole: session.actor.role,
      entityType: 'trainer_club_link',
      entityId: link.id,
      meta: { trainerId: link.trainerId, clubId: link.clubId, initiatedBy },
    });

    return link;
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<TrainerClubLink> {
    const linkId = parseLinkId(rawId);
    // Тело этому действию больше не нужно вовсе: единственным его полем был номер
    // действующего. Присланное старым клиентом просто не читается.
    const { link, approverIsClub } = await this.links.approve(linkId, session.user.id);

    await this.logs.record({
      action: 'link_approve',
      actorId: session.actor.id,
      actorRole: session.actor.role,
      entityType: 'trainer_club_link',
      entityId: linkId,
      // Сторона подтверждения переехала в `meta`: раньше её изображала роль,
      // и под имперсонизацией запись врала про исполнителя.
      meta: {
        trainerId: link.trainerId,
        clubId: link.clubId,
        initiatedBy: link.initiatedBy,
        approvedBy: approverIsClub ? 'club' : 'trainer',
      },
    });

    return link;
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<TrainerClubLink> {
    const linkId = parseLinkId(rawId);
    // Тела может не быть вовсе — причина отказа необязательна.
    const parsed = rejectSchema.safeParse(rawBody ?? {});

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const { link, rejectorIsClub } = await this.links.reject(
      linkId,
      session.user.id,
      parsed.data.reason,
    );

    await this.logs.record({
      action: 'link_reject',
      actorId: session.actor.id,
      actorRole: session.actor.role,
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: {
        trainerId: link.trainerId,
        clubId: link.clubId,
        reason: parsed.data.reason,
        initiatedBy: link.initiatedBy,
        rejectedBy: rejectorIsClub ? 'club' : 'trainer',
      },
    });

    return link;
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<TrainerClubLink> {
    const linkId = parseLinkId(rawId);
    const { link, revokedBy, detachedCount } = await this.links.revoke(linkId, session.user.id);

    await this.logs.record({
      action: 'link_revoke',
      actorId: session.actor.id,
      // Кто разорвал связь по сторонам — в `meta` (`revokedBy`), а здесь роль
      // того, кто действительно вошёл.
      actorRole: session.actor.role,
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: { trainerId: link.trainerId, clubId: link.clubId, revokedBy, detachedCount },
    });

    return link;
  }

  // --- Внутреннее ---------------------------------------------------------------

  /**
   * Свои связи: те, где пользователь — сторона, как владелец тренера или клуба.
   *
   * Отбор идёт ЗАПРОСОМ по своей стороне, а не проверкой уже прочитанного среза:
   * под каждый такой запрос в базе есть индекс (`[trainerId, status, createdAt]`
   * и `[clubId, status, createdAt]`), а чтение всех связей платформы ради выдачи
   * двух — ровно то, от чего уходили в шагах 33.48.
   *
   * Запросов столько, сколько у пользователя публикаций: набор `IN` выразил бы
   * это одним, но для него нужен новый параметр репозитория — отдельный шаг.
   * Здесь важнее, что чужие строки до приложения не доезжают вовсе.
   */
  private async listOwn(userId: number, filter: LinkFilter): Promise<TrainerClubLink[]> {
    const [clubs, trainers] = await Promise.all([
      this.clubs.findAll({ managedByUserId: userId }),
      this.trainers.findAll({ managedByUserId: userId }),
    ]);

    const clubIds = clubs.map((club) => club.id);
    const trainerIds = trainers.map((trainer) => trainer.id);

    // Если названная в запросе сторона своя — фильтр уже гарантирует, что чужого
    // в выдачу не попадёт, и хватает одного запроса.
    if (
      (filter.clubId !== undefined && clubIds.includes(filter.clubId)) ||
      (filter.trainerId !== undefined && trainerIds.includes(filter.trainerId))
    ) {
      return this.links.list(filter);
    }

    // Иначе недостающую сторону подставляем своими публикациями. Названную
    // в запросе сторону при этом не трогаем: спрашивали про неё — про неё и отвечаем,
    // просто в паре со своей.
    const queries: Promise<TrainerClubLink[]>[] = [];

    if (filter.clubId === undefined) {
      queries.push(...clubIds.map((clubId) => this.links.list({ ...filter, clubId })));
    }

    if (filter.trainerId === undefined) {
      queries.push(...trainerIds.map((trainerId) => this.links.list({ ...filter, trainerId })));
    }

    // Обе стороны названы и обе чужие — своих связей среди них нет по определению.
    return mergeNewestFirst(await Promise.all(queries));
  }
}

export const LINK_CONTROLLERS = [TrainerClubLinksController];
