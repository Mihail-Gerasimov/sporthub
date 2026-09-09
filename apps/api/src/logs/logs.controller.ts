// Журнал действий.
//
// Списки допустимых действий, типов сущностей и ролей не объявляются здесь:
// они импортируются из @sporthub/types, где лежат единственными копиями
// (LOG_ACTIONS / LOG_ENTITY_TYPES / USER_ROLES). Раньше контроллер держал свои
// урезанные копии, и записи вроде `link_approve` или `booking_confirm` система
// писала, но ни принять, ни отфильтровать по ним не могла.
//
// Фаза 34: маршрут ЗАПИСИ с клиента убран совсем.
//
// Он принимал исполнителя и его роль прямо из тела: кто угодно мог написать
// в журнал что угодно от имени администратора. Журнал, которому нельзя верить,
// хуже отсутствующего — по нему принимают решения.
//
// Теперь журнал пишет только сервер, из своих обработчиков, беря исполнителя
// из сессии. Клиентских записей не осталось: события входа, выхода и работы
// от чужого лица фиксирует сам бэкенд.
//
// Чтение — под правом администратора: журнал платформы отдавался анонимно
// постранично, вместе с номерами исполнителей и служебными подробностями.

import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { LogAction, LogEntityType, LogEntry, UserRole } from '@sporthub/types';
import { LOG_ACTIONS } from '@sporthub/types';
import { z } from 'zod';

import { Requires } from '../auth/access.decorators';
import { withTopLevel, type TopLevelResult } from '../common/api-response';
import { ValidationError } from '../common/domain-error';
import type { LogsRepository } from '../repositories/crud.repository';
import { LOGS_REPOSITORY } from '../repositories/crud.repository';

const querySchema = z.object({
  action: z
    .string()
    .refine((value) => LOG_ACTIONS.includes(value as LogAction))
    .optional(),
  actorId: z.coerce.number().int().positive().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Право одно на весь раздел: журнал целиком служебный.
@Requires('view_platform_logs')
@Controller('logs')
export class LogsController {
  constructor(@Inject(LOGS_REPOSITORY) private readonly logs: LogsRepository) {}

  @Get()
  async findMany(@Query() rawQuery: Record<string, string>): Promise<TopLevelResult<LogEntry[]>> {
    const parsed = querySchema.safeParse(rawQuery);

    if (!parsed.success) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const { action, actorId, from, to, offset, limit } = parsed.data;

    // ⚠️ Отбор, порядок и постраничность целиком уходят в хранилище. Раньше журнал
    // читался ЦЕЛИКОМ, четырежды фильтровался в памяти и резался срезом массива:
    // каждая страница админки поднимала весь журнал платформы, а общее число
    // считалось длиной этого массива. Теперь это условие запроса, `LIMIT/OFFSET`
    // и отдельный счёт — цена страницы перестала зависеть от размера журнала.
    // Порядок «свежие первыми» с тай-брейкером по номеру задаёт сам репозиторий:
    // `ORDER BY` в базе неустойчив, и при равных метках страница 2 могла бы
    // повторить строку со страницы 1.
    const page = await this.logs.findPage({
      // Значение уже сверено со словарём действий в схеме выше — приведение
      // только сообщает об этом типам, проверки оно не заменяет.
      action: action as LogAction | undefined,
      actorId,
      from,
      to,
      offset,
      limit,
    });

    // Счётчики лежат РЯДОМ с data — форма ответа журнала и публикаций.
    return withTopLevel(page.items, { total: page.total, offset, limit });
  }
}

export const LOG_CONTROLLERS = [LogsController];
