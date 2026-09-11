// Журнал действий платформы.
//
// Как и уведомления, это побочный эффект: неудачная запись в журнал не должна
// ронять основную операцию. Различие с прежней реализацией одно — сбой пишется
// в лог приложения, а не проглатывается пустым обработчиком.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_ACTOR_ROLE } from '@sporthub/domain';
import type { LogAction, LogEntityType } from '@sporthub/types';

import type { LogsRepository } from '../repositories/crud.repository';
import { LOGS_REPOSITORY } from '../repositories/crud.repository';

/**
 * Реэкспорт: объявление живёт в `@sporthub/domain` — его читает и генератор
 * ограничений базы (шаг 37.27). Здесь оно остаётся видимым по прежнему пути,
 * чтобы места записи не знали, где хранится словарь.
 */
export { SYSTEM_ACTOR_ROLE };

export type LogActionInput = {
  action: LogAction;
  /**
   * Кто сделал. Не задан — сделала САМА ПЛОЩАДКА, и человека за действием нет.
   *
   * ⚠️ Пустота допустима ТОЛЬКО вместе с `actorRole: SYSTEM_ACTOR_ROLE`, и это
   * держит база (`logs_actor_or_system`), а не добросовестность вызывающего.
   * До шага 37.27 колонка была обязательной, и событиям площадки приходилось
   * назначать исполнителем случайного участника — то есть журнал говорил
   * неправду о том, кто действовал. Подбор пароля по НЕСУЩЕСТВУЮЩЕЙ почте
   * не оставлял следа вовсе: привязать строку было не к кому.
   */
  actorId?: number;
  /**
   * Кем был исполнитель в момент действия — исторический снимок.
   *
   * ⚠️ Шаг 35.19d. До фазы 35 сюда писалось имя роли, и старые строки журнала
   * его хранят. После фазы ролей нет, и пишется вид учётной записи
   * (`person` / `admin`). Тип — строка, а не объединение: журнал читает и то,
   * и другое, а сузить его значило бы соврать про уже записанные строки.
   *
   * Решений о доступе это поле не принимает — только рассказывает.
   */
  actorRole: string;
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
