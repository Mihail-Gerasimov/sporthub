// Контекст слота — всё, что нужно странице записи: сам слот, услуга, владелец
// и клуб-площадка. Маршрута для этого раньше не было: страница читала слой
// данных напрямую.
//
// В отличие от выдачи расписания, заполненный слот отсюда НЕ исчезает: страница
// записи обязана показать, что мест не осталось, а не притвориться, что слота нет.

import { Controller, Get, Param } from '@nestjs/common';
import type { Offering, Schedule } from '@sporthub/types';

import { Public } from '../auth/access.decorators';
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
  constructor(private readonly slots: SlotContextService) {}

  @Get(':id/context')
  async findContext(@Param('id') rawId: string): Promise<PublicSlotContext> {
    const scheduleId = Number(rawId);

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      throw new ValidationError('Некорректный идентификатор слота');
    }

    const context = await this.slots.getContext(scheduleId);

    if (!context) {
      throw new NotFoundError('Слот расписания не найден');
    }

    return {
      ...context,
      affiliatedClub: stripOptionalPublicationOwner(context.affiliatedClub),
      club: stripOptionalPublicationOwner(context.club),
      trainer: stripOptionalPublicationOwner(context.trainer),
    };
  }
}
