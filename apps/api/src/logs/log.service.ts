// Журнал действий платформы.
//
// Как и уведомления, это побочный эффект: неудачная запись в журнал не должна
// ронять основную операцию. Различие с прежней реализацией одно — сбой пишется
// в лог приложения, а не проглатывается пустым обработчиком.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LogAction, LogEntityType, UserRole } from '@sporthub/types';

import type { LogsRepository } from '../repositories/crud.repository';
import { LOGS_REPOSITORY } from '../repositories/crud.repository';

export type LogActionInput = {
  action: LogAction;
  actorId: number;
  actorRole: UserRole;
  entityType: LogEntityType;
  entityId: number;
  meta?: Record<string, unknown>;
};

@Injectable()
export class LogService {
  private readonly logger = new Logger(LogService.name);

  constructor(@Inject(LOGS_REPOSITORY) private readonly logs: LogsRepository) {}

  async record(input: LogActionInput): Promise<void> {
    try {
      await this.logs.insert(input);
    } catch (error) {
      this.logger.error(`Не удалось записать действие ${input.action}`, error);
    }
  }
}
