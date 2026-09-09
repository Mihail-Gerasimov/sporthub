// Контекст слота — всё, что нужно странице записи: сам слот, услуга, владелец
// и клуб-площадка. Маршрута для этого раньше не было: страница читала слой
// данных напрямую.
//
// В отличие от выдачи расписания, заполненный слот отсюда НЕ исчезает: страница
// записи обязана показать, что мест не осталось, а не притвориться, что слота нет.

import { Controller, Get, Param } from '@nestjs/common';

import { Public } from '../auth/access.decorators';
import { NotFoundError, ValidationError } from '../common/domain-error';
import { SlotContextService, type SlotContext } from './slot-context.service';

// Пометка на классе: маршрут один и он публичный. Страница записи открывается
// гостю — он видит, на что записывается (занятие, услуга, тренер, площадка),
// и только на самой записи упирается во вход. Сама запись остаётся закрытой:
// публичен лишь показ слота, а не действие с ним.
@Public()
@Controller('schedule')
export class SlotContextController {
  constructor(private readonly slots: SlotContextService) {}

  @Get(':id/context')
  async findContext(@Param('id') rawId: string): Promise<SlotContext> {
    const scheduleId = Number(rawId);

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      throw new ValidationError('Некорректный идентификатор слота');
    }

    const context = await this.slots.getContext(scheduleId);

    if (!context) {
      throw new NotFoundError('Слот расписания не найден');
    }

    return context;
  }
}
