// Связи тренер↔клуб: заявка, подтверждение, отказ, разрыв.
//
// Ключевое правило — симметрия: решение принимает всегда сторона,
// ПРОТИВОПОЛОЖНАЯ инициатору. Заявку тренера подтверждает клуб, приглашение
// клуба — тренер. Инициатор одобрить сам себя не может.
//
// При разрыве связи услуги тренера, привязанные к ней, становятся частными:
// иначе публичные страницы продолжали бы показывать «в клубе X».

import { isActiveLinkStatus } from '@sporthub/domain';
import { Inject, Injectable } from '@nestjs/common';
import type { TrainerClubLink } from '@sporthub/types';

import { AccessService } from '../access/access.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../common/domain-error';
import { NotificationService } from '../notifications/notification.service';
import type {
  OfferingsRepository,
  TrainerClubLinksRepository,
} from '../repositories/catalog.repository';
import {
  OFFERINGS_REPOSITORY,
  TRAINER_CLUB_LINKS_REPOSITORY,
} from '../repositories/catalog.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';

export type LinkInitiator = 'trainer' | 'club';
export type LinkRevoker = 'trainer' | 'club' | 'admin';

export type CreateLinkResult = {
  link: TrainerClubLink;
  initiatedBy: LinkInitiator;
  /** Кому ушло уведомление — нужно вызывающему для записи в журнал. */
  notifiedUserId?: number;
};

@Injectable()
export class LinkService {
  constructor(
    @Inject(TRAINER_CLUB_LINKS_REPOSITORY) private readonly links: TrainerClubLinksRepository,
    @Inject(OFFERINGS_REPOSITORY) private readonly offerings: OfferingsRepository,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    private readonly access: AccessService,
    private readonly notifications: NotificationService,
  ) {}

  /** Чтение с фильтрами: свежие сверху. */
  list(filter: {
    trainerId?: number;
    clubId?: number;
    status?: TrainerClubLink['status'];
  }): Promise<TrainerClubLink[]> {
    return this.links.findMany(filter);
  }

  /** Заявка на связь. Инициировать может любая из сторон. */
  async create(input: {
    trainerId: number;
    clubId: number;
    userId: number;
    initiatedBy?: LinkInitiator;
  }): Promise<CreateLinkResult> {
    const [trainer, club] = await Promise.all([
      this.trainers.findById(input.trainerId),
      this.clubs.findById(input.clubId),
    ]);

    if (!trainer) {
      throw new NotFoundError('Тренер не найден');
    }

    if (!club) {
      throw new NotFoundError('Клуб не найден');
    }

    const [isTrainerManager, isClubManager] = await Promise.all([
      this.access.isManagerOfTrainer(input.trainerId, input.userId),
      this.access.isManagerOfClub(input.clubId, input.userId),
    ]);

    if (!isTrainerManager && !isClubManager) {
      throw new ForbiddenError('Недостаточно прав для отправки запроса');
    }

    // Если клиент не сказал, кто инициатор, — вычисляем по правам.
    // Сторона с обеими ролями считается тренером: так вели себя старые клиенты.
    const initiatedBy: LinkInitiator =
      input.initiatedBy ?? (isClubManager && !isTrainerManager ? 'club' : 'trainer');

    // ⚠️ Названная сторона обязана быть СВОЕЙ, и до этапа Э8a это не проверялось.
    // Дыра: владелец клуба присылал «инициатор — тренер», связь вставала в состояние,
    // где решение принимает клуб, то есть он сам, — и подтверждал приглашение за
    // тренера, которого никто не спрашивал. Здесь решает не роль, а владение:
    // роль говорит, что человеку положено вести связи, владение — с какой он стороны.
    const initiatorIsManager = initiatedBy === 'club' ? isClubManager : isTrainerManager;

    if (!initiatorIsManager) {
      throw new ForbiddenError('Недостаточно прав для отправки запроса');
    }

    const existing = await this.links.findMany({
      trainerId: input.trainerId,
      clubId: input.clubId,
    });

    // Набор действующих состояний общий с предикатом уникального индекса в базе.
    if (existing.some((link) => isActiveLinkStatus(link.status))) {
      throw new ConflictError('Для этой пары уже существует активная связь');
    }

    // ⚠️ Шаг 35.10, решение заказчика 22. Обе стороны у одной учётной записи —
    // единственное исключение из общего потока «запрос → подтверждение».
    //
    // Логика площадки едина для всех: связь появляется, когда её признали обе стороны.
    // Но когда стороны — один человек, признавать нечего и спрашивать некого: точка
    // входа и конечная точка совпадают. Прежний путь заставлял его подать заявку
    // самому себе, получить о ней уведомление и самому же её подтвердить.
    //
    // Признак — ВЛАДЕНИЕ, а не роль: «принадлежат ли обе стороны одному человеку».
    // Проверка «названная сторона моя» выше остаётся на месте — она закрывает подмену
    // ЧУЖОЙ стороны, и это разные вопросы.
    const bothSidesMine = isTrainerManager && isClubManager;

    const link = await this.links.insert({
      trainerId: input.trainerId,
      clubId: input.clubId,
      status: bothSidesMine ? 'confirmed' : 'pending',
      initiatedBy,
      ...(bothSidesMine
        ? { approvedByUserId: input.userId, approvedAt: new Date().toISOString() }
        : {}),
    });

    // Уведомление уходит противоположной стороне: инициатор не должен получать
    // сообщение о собственной заявке. Когда обе стороны свои, противоположной
    // стороны нет вовсе — уведомлять некого.
    const notifiedUserId = bothSidesMine
      ? undefined
      : initiatedBy === 'club'
        ? trainer.managedByUserId
        : club.managedByUserId;

    if (notifiedUserId !== undefined) {
      await this.notifications.notify(notifiedUserId, 'link_requested', {
        linkId: link.id,
        trainerId: input.trainerId,
        clubId: input.clubId,
        initiatedBy,
      });
    }

    return { link, initiatedBy, notifiedUserId };
  }

  /** Подтверждение заявки противоположной стороной. */
  async approve(
    linkId: number,
    userId: number,
  ): Promise<{ link: TrainerClubLink; approverIsClub: boolean }> {
    const link = await this.requireLink(linkId);
    const approverIsClub = link.initiatedBy === 'trainer';

    await this.assertDecisionRight(
      link,
      userId,
      approverIsClub,
      'Недостаточно прав для подтверждения связи',
    );

    if (link.status !== 'pending') {
      throw new ConflictError('Связь не в состоянии pending');
    }

    const updated = await this.links.update(linkId, {
      status: 'confirmed',
      approvedAt: new Date().toISOString(),
      approvedByUserId: userId,
    });

    await this.notifyInitiator(link, 'link_approved', {
      linkId,
      trainerId: link.trainerId,
      clubId: link.clubId,
      initiatedBy: link.initiatedBy,
    });

    return { link: updated, approverIsClub };
  }

  /** Отказ по заявке. Право решения — то же, что и у подтверждения. */
  async reject(
    linkId: number,
    userId: number,
    reason?: string,
  ): Promise<{ link: TrainerClubLink; rejectorIsClub: boolean }> {
    const link = await this.requireLink(linkId);
    const rejectorIsClub = link.initiatedBy === 'trainer';

    await this.assertDecisionRight(link, userId, rejectorIsClub, 'Недостаточно прав для отказа');

    if (link.status !== 'pending') {
      throw new ConflictError('Связь не в состоянии pending');
    }

    const updated = await this.links.update(linkId, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedByUserId: userId,
      rejectionReason: reason,
    });

    await this.notifyInitiator(link, 'link_rejected', {
      linkId,
      trainerId: link.trainerId,
      clubId: link.clubId,
      reason,
      initiatedBy: link.initiatedBy,
    });

    return { link: updated, rejectorIsClub };
  }

  /**
   * Разрыв связи. Доступен обеим сторонам и администратору; тренер отзывает
   * ещё не одобренную заявку тем же переходом.
   */
  async revoke(
    linkId: number,
    userId: number,
  ): Promise<{ link: TrainerClubLink; revokedBy: LinkRevoker; detachedCount: number }> {
    const link = await this.requireLink(linkId);

    if (link.status !== 'confirmed' && link.status !== 'pending') {
      throw new ConflictError('Связь уже завершена (rejected/revoked)');
    }

    const [isAdmin, isTrainerManager, isClubManager] = await Promise.all([
      this.access.isAdmin(userId),
      this.access.isManagerOfTrainer(link.trainerId, userId),
      this.access.isManagerOfClub(link.clubId, userId),
    ]);

    // Порядок важен: у одной стороны могут быть все роли сразу.
    let revokedBy: LinkRevoker;

    if (isTrainerManager) {
      revokedBy = 'trainer';
    } else if (isClubManager) {
      revokedBy = 'club';
    } else if (isAdmin) {
      revokedBy = 'admin';
    } else {
      throw new ForbiddenError('Недостаточно прав для разрыва связи');
    }

    return this.applyRevoke(link, userId, revokedBy, { notifyBothSides: false });
  }

  /** Административный разрыв: права стороны не требуются, уведомляются обе. */
  async forceRevoke(
    linkId: number,
    adminUserId: number,
  ): Promise<{ link: TrainerClubLink; detachedCount: number }> {
    const link = await this.requireLink(linkId);

    if (link.status !== 'confirmed' && link.status !== 'pending') {
      throw new ConflictError('Связь уже завершена (rejected/revoked)');
    }

    const result = await this.applyRevoke(link, adminUserId, 'admin', { notifyBothSides: true });

    return { link: result.link, detachedCount: result.detachedCount };
  }

  // --- Внутреннее ---------------------------------------------------------------

  private async requireLink(linkId: number): Promise<TrainerClubLink> {
    const link = await this.links.findById(linkId);

    if (!link) {
      throw new NotFoundError('Связь не найдена');
    }

    return link;
  }

  /** Решение принимает противоположная инициатору сторона. */
  private async assertDecisionRight(
    link: TrainerClubLink,
    userId: number,
    deciderIsClub: boolean,
    message: string,
  ): Promise<void> {
    const isManager = deciderIsClub
      ? await this.access.isManagerOfClub(link.clubId, userId)
      : await this.access.isManagerOfTrainer(link.trainerId, userId);

    if (!isManager) {
      throw new ForbiddenError(message);
    }
  }

  private async notifyInitiator(
    link: TrainerClubLink,
    type: 'link_approved' | 'link_rejected',
    payload: Record<string, unknown>,
  ): Promise<void> {
    const [trainer, club] = await Promise.all([
      this.trainers.findById(link.trainerId),
      this.clubs.findById(link.clubId),
    ]);
    const notifyUserId =
      link.initiatedBy === 'trainer' ? trainer?.managedByUserId : club?.managedByUserId;

    if (notifyUserId !== undefined) {
      await this.notifications.notify(notifyUserId, type, payload);
    }
  }

  /** Общая часть обычного и административного разрыва. */
  private async applyRevoke(
    link: TrainerClubLink,
    userId: number,
    revokedBy: LinkRevoker,
    options: { notifyBothSides: boolean },
  ): Promise<{ link: TrainerClubLink; revokedBy: LinkRevoker; detachedCount: number }> {
    const updated = await this.links.update(link.id, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedByUserId: userId,
      revokedBy,
    });

    // Услуги, висевшие на этой связи, становятся частными.
    const attached = await this.offerings.findByLinkId(link.id);
    const detachedCount = await this.offerings.updateMany(
      attached.map((offering) => offering.id),
      { trainerClubLinkId: undefined },
    );

    const [trainer, club] = await Promise.all([
      this.trainers.findById(link.trainerId),
      this.clubs.findById(link.clubId),
    ]);
    const payload = {
      linkId: link.id,
      trainerId: link.trainerId,
      clubId: link.clubId,
      revokedBy,
    };

    if (
      (options.notifyBothSides || revokedBy !== 'trainer') &&
      trainer?.managedByUserId !== undefined
    ) {
      await this.notifications.notify(trainer.managedByUserId, 'link_revoked', payload);
    }

    if ((options.notifyBothSides || revokedBy !== 'club') && club?.managedByUserId !== undefined) {
      await this.notifications.notify(club.managedByUserId, 'link_revoked', payload);
    }

    return { link: updated, revokedBy, detachedCount };
  }
}
