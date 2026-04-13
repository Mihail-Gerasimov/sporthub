// API логов активности: GET (чтение с фильтрами и пагинацией), POST (запись из клиента)
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getLogs } from '@/lib/db';
import type { LogAction } from '@/types';

/** Допустимые значения action для валидации */
const LOG_ACTIONS: LogAction[] = [
  'publish_create',
  'publish_update',
  'publish_delete',
  'booking_create',
  'booking_cancel',
  'admin_login',
  'admin_impersonate_start',
  'admin_impersonate_stop',
  'moderation_hide',
  'moderation_unhide',
  'moderation_auto_restore',
];

const logsQuerySchema = z.object({
  action: z
    .string()
    .refine((v) => LOG_ACTIONS.includes(v as LogAction))
    .optional(),
  actorId: z.coerce.number().int().positive().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** GET /api/logs — чтение логов с фильтрацией и пагинацией (offset/limit) */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsed = logsQuerySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные параметры запроса' },
        { status: 400 },
      );
    }

    const { action, actorId, from, to, offset, limit } = parsed.data;

    let logs = await getLogs();

    // Фильтрация
    if (action) {
      logs = logs.filter((l) => l.action === action);
    }
    if (actorId !== undefined) {
      logs = logs.filter((l) => l.actorId === actorId);
    }
    if (from) {
      logs = logs.filter((l) => l.createdAt >= from);
    }
    if (to) {
      logs = logs.filter((l) => l.createdAt <= to);
    }

    // Сортировка по createdAt desc (новые первые)
    logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = logs.length;
    const data = logs.slice(offset, offset + limit);

    return NextResponse.json({ success: true, data, total, offset, limit });
  } catch (error) {
    console.error('Ошибка чтения логов:', error);

    return NextResponse.json(
      { success: false, error: 'Не удалось получить логи' },
      { status: 500 },
    );
  }
}
