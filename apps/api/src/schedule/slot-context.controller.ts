// Контекст слота — всё, что нужно странице записи: сам слот, услуга, владелец
// и клуб-площадка. Маршрута для этого раньше не было: страница читала слой
// данных напрямую.
//
// В отличие от выдачи расписания, заполненный слот отсюда НЕ исчезает: страница
// записи обязана показать, что мест не осталось, а не притвориться, что слота нет.

import { Controller, Get, Param } from '@nestjs/common';
import type { Offering, Schedule } from '@sporthub/types';

import { AccessService } from '../access/access.service';
import { CurrentUser, Public } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import {
  stripOptionalPublicationOwner,
  type PublicClub,
  type PublicTrainer,
} from '../catalog/public-view';
import { NotFoundError, ValidationError } from '../common/domain-error';
import { SlotContextService } from './slot-context.service';

/**
 * Контекст слота в публичной выдаче.
 *
 * ⚠️ Шаг 35.20a. Маршрут отдаёт сразу три публикации — клуб-владельца,
 * тренера и клуб-площадку, — и номер владельца убран у всех трёх: страница
 * записи открыта гостю, а значит это такая же публичная выдача, как каталог.
 * Убирать поле именно здесь, в контроллере, а не в сервисе: тем же контекстом
 * пользуются создание записи и её проверки, и им владелец слота нужен.
 */
export type PublicSlotContext = {
  affiliatedClub: PublicClub | null;
  club: PublicClub | null;
  offering: Offering | null;
  schedule: Schedule;
  trainer: PublicTrainer | null;
};

// Пометка на классе: маршрут один и он публичный. Страница записи открывается
// гостю — он видит, на что записывается (занятие, услуга, тренер, площадка),
// и только на самой записи упирается во вход. Сама запись остаётся закрытой:
// публичен лишь показ слота, а не действие с ним.
@Public()
@Controller('schedule')
export class SlotContextController {
  constructor(
    private readonly slots: SlotContextService,
    private readonly access: AccessService,
  ) {}

  @Get(':id/context')
  async findContext(
    @Param('id') rawId: string,
    @CurrentUser() session?: SessionContext,
  ): Promise<PublicSlotContext> {
    const scheduleId = Number(rawId);

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      throw new ValidationError('Некорректный идентификатор слота');
    }

    const context = await this.slots.getContext(scheduleId);

    if (!context) {
      throw new NotFoundError('Слот расписания не найден');
    }

    // ⚠️ Шаг 36.16. Шестой путь к скрытой публикации, и самый незаметный:
    // страница записи открыта гостю и отдаёт сразу три публикации — клуб-владельца,
    // тренера и клуб-площадку. Проверки статуса здесь не было ВООБЩЕ, то есть
    // скрытая публикация приходила гостю целиком через адрес слота.
    //
    // Правило то же самое, что у карточки, и берётся оттуда же: своего понятия
    // видимости здесь не заводится.
    await this.assertOwnersVisible(context, session);

    return {
      ...context,
      affiliatedClub: stripOptionalPublicationOwner(context.affiliatedClub),
      club: stripOptionalPublicationOwner(context.club),
      trainer: stripOptionalPublicationOwner(context.trainer),
    };
  }

  /**
   * Виден ли слот: он виден ровно настолько, насколько видны его публикации.
   *
   * Скрыт клуб-владелец или тренер — слота для смотрящего не существует.
   * Скрыт клуб-ПЛОЩАДКА — занятие всё равно принадлежит тренеру и остаётся
   * видимым: площадка тут не владелец, а место. Разница не косметическая:
   * закрыв слот по площадке, мы спрятали бы чужое занятие вместе с чужим залом.
   */
  private async assertOwnersVisible(
    context: {
      club: { id: number; status?: string } | null;
      trainer: { id: number; status?: string } | null;
    },
    session: SessionContext | undefined,
  ): Promise<void> {
    const owners = [
      context.club === null
        ? null
        : ({ kind: 'club', id: context.club.id, status: context.club.status } as const),
      context.trainer === null
        ? null
        : ({ kind: 'trainer', id: context.trainer.id, status: context.trainer.status } as const),
    ];

    for (const owner of owners) {
      if (owner === null || owner.status !== 'hidden') {
        continue;
      }

      const visible = await this.access.canSeeHiddenPublication(
        { kind: owner.kind, id: owner.id },
        session?.user.id,
      );

      if (!visible) {
        // Тот же текст, что у настоящего отсутствия: иначе разница в формулировке
        // рассказала бы ровно то, что мы скрываем.
        throw new NotFoundError('Слот расписания не найден');
      }
    }
  }
}
