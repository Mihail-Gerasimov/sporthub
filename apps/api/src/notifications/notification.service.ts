// Отправка уведомлений.
//
// Прежняя реализация глушила любую ошибку записи молча, чтобы сбой уведомления
// не ронял основную операцию. Поведение сохранено, но теперь сбой хотя бы
// попадает в лог, а не исчезает бесследно.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Notification, NotificationType } from '@sporthub/types';

import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notifications: NotificationsRepository,
  ) {}

  /**
   * Создать уведомление. Ошибка записи не пробрасывается: уведомление — побочный
   * эффект, из-за него не должна падать запись на тренировку или смена статуса.
   */
  async notify(
    userId: number,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<Notification | null> {
    try {
      return await this.notifications.insert({ userId, type, payload });
    } catch (error) {
      this.logger.error(`Не удалось создать уведомление ${type} для пользователя ${userId}`, error);

      return null;
    }
  }
}
