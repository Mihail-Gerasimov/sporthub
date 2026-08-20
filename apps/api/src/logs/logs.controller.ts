// Журнал действий.
//
// Списки допустимых действий, типов сущностей и ролей не объявляются здесь:
// они импортируются из @sporthub/types, где лежат единственными копиями
// (LOG_ACTIONS / LOG_ENTITY_TYPES / USER_ROLES). Раньше контроллер держал свои
// урезанные копии, и записи вроде `link_approve` или `booking_confirm` система
// писала, но ни принять, ни отфильтровать по ним не могла.
//
// ⚠️ Маршрут записи принимает исполнителя и его роль прямо из тела — подделать
// авторство записи может кто угодно. Перенесено как есть.

import { compareByCreatedAtDesc } from '@sporthub/domain';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { LogAction, LogEntityType, LogEntry, UserRole } from '@sporthub/types';
import { LOG_ACTIONS, LOG_ENTITY_TYPES, USER_ROLES } from '@sporthub/types';
import { z } from 'zod';

import { withTopLevel, type TopLevelResult } from '../common/api-response';
import { ValidationError } from '../common/domain-error';
import type { LogsRepository } from '../repositories/crud.repository';
import { LOGS_REPOSITORY } from '../repositories/crud.repository';

const createSchema = z.object({
  action: z
    .string()
    .refine((value) => LOG_ACTIONS.includes(value as LogAction), 'Недопустимое действие'),
  actorId: z.number().int().positive(),
  actorRole: z
    .string()
    .refine((value) => USER_ROLES.includes(value as UserRole), 'Недопустимая роль'),
  entityType: z
    .string()
    .refine(
      (value) => LOG_ENTITY_TYPES.includes(value as LogEntityType),
      'Недопустимый тип сущности',
    ),
  entityId: z.number().int().positive(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

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
    let entries = await this.logs.findAll();

    if (action) {
      entries = entries.filter((entry) => entry.action === action);
    }

    if (actorId !== undefined) {
      entries = entries.filter((entry) => entry.actorId === actorId);
    }

    if (from) {
      entries = entries.filter((entry) => entry.createdAt >= from);
    }

    if (to) {
      entries = entries.filter((entry) => entry.createdAt <= to);
    }

    // Тай-брейкер обязателен: `ORDER BY` в базе неустойчив, и при равных метках
    // времени порядок стал бы случайным от прогона к прогону.
    entries = entries.slice().sort(compareByCreatedAtDesc);

    // Счётчики лежат РЯДОМ с data — форма ответа журнала и публикаций.
    return withTopLevel(entries.slice(offset, offset + limit), {
      total: entries.length,
      offset,
      limit,
    });
  }

  @Post()
  async create(@Body() rawBody: unknown): Promise<LogEntry> {
    const parsed = createSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные лога');
    }

    return this.logs.insert(parsed.data as Omit<LogEntry, 'id' | 'createdAt'>);
  }
}

export const LOG_CONTROLLERS = [LogsController];
