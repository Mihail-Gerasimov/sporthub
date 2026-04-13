/**
 * Fire-and-forget хелпер для записи логов активности платформы.
 * Вызывается из API routes без await — ошибка записи не влияет на HTTP-ответ.
 */
import { appendLog } from '@/lib/db';
import type { LogEntry } from '@/types';

/** Записывает лог активности. При ошибке — молча логирует в console.error. */
export async function logAction(params: Omit<LogEntry, 'id' | 'createdAt'>): Promise<void> {
  try {
    await appendLog(params);
  } catch (error) {
    console.error('[logAction] failed:', error);
  }
}
