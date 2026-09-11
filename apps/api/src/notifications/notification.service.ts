// Отправка уведомлений.
//
// Прежняя реализация глушила любую ошибку записи молча, чтобы сбой уведомления
// не ронял основную операцию. Поведение сохранено, но теперь сбой хотя бы
// попадает в лог, а не исчезает бесследно.
//
// ⚠️ Фаза 35, шаг 35.27. Адресат уведомления перестал быть ЧЕЛОВЕКОМ и стал ЛИЦОМ.
// До неё владелец трёх клубов получал одну общую кучу: разобрать, к какому клубу
// относится заявка, было нечем, а «прочитать всё» гасило её целиком. Теперь запись
// на занятие клуба приходит клубу, а своя запись к чужому тренеру — самому человеку.
//
// Адресат называется ОДНИМ значением, а не парой необязательных аргументов:
// «человек» и «лицо» — разные формы, и забыть заполнить лицо, назвав только номер
// человека, теперь нельзя — это будет уведомление человеку, чем оно и написано.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CatalogOwnerType, EntityId, Notification, NotificationType } from '@sporthub/types';

import { canDisableNotificationType } from '@sporthub/domain';

import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

/**
 * Кому адресовано уведомление.
 *
 * Человеку — только его номер, обе колонки лица остаются пустыми. Лицу услуг —
 * вид, номер и владелец-человек: колонка `user_id` остаётся NOT NULL, потому что
 * объединённый ящик «всё моё» читается по ней одним условием, без `OR` по лицам.
 */
export type PersonRecipient = { readonly userId: EntityId };

export type FaceRecipient = {
  readonly addresseeType: CatalogOwnerType;
  readonly addresseeId: EntityId;
  readonly managedByUserId: EntityId;
};

export type NotificationRecipient = PersonRecipient | FaceRecipient;

/**
 * Лицо услуг как адресат — из уже прочитанного клуба или карточки тренера.
 *
 * Владелец у лица необязателен в типе (карточки из сида ничьи), а колонка
 * `user_id` обязательна. Поэтому «владельца нет» здесь означает «отправлять
 * некуда», и вызов возвращает `null`: раньше эта же проверка была рассыпана
 * по пяти местам записи отдельными `if`.
 */
export function faceRecipient(
  addresseeType: CatalogOwnerType,
  face: { id: EntityId; managedByUserId?: EntityId } | null | undefined,
): FaceRecipient | null {
  if (!face || face.managedByUserId === undefined) return null;

  return { addresseeType, addresseeId: face.id, managedByUserId: face.managedByUserId };
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly notifications: NotificationsRepository,
    // Настройки адресата — они решают, создавать ли строку (шаг 36.49).
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  /**
   * Создать уведомление. Ошибка записи не пробрасывается: уведомление — побочный
   * эффект, из-за него не должна падать запись на тренировку или смена статуса.
   */
  async notify(
    recipient: NotificationRecipient,
    type: NotificationType,
    payload: Record<string, unknown>,
  ): Promise<Notification | null> {
    // Ящик лица несёт и лицо, и его владельца: первое решает видимость строки,
    // второе даёт срез «всё моё» и каскад при удалении человека.
    const addressee =
      'userId' in recipient
        ? { userId: recipient.userId }
        : {
            userId: recipient.managedByUserId,
            addresseeType: recipient.addresseeType,
            addresseeId: recipient.addresseeId,
          };

    // ⚠️ Шаг 36.49, решение заказчика 22. Настройка спрашивается ЗДЕСЬ, при отправке,
    // и выключенный тип не создаёт строки вовсе.
    //
    // Прежде строка писалась всегда, а прятали её читатели — лента, счётчик
    // и колокольчик, — каждый сам. За две фазы это дало три ошибки подряд:
    // «в колокольчике 3, в списке 0»; настройки лица сохранялись и не применялись;
    // колокольчик применял личные настройки к строкам всех лиц. Ломалась не логика,
    // а место: решение принимали трое, и каждый решал чуть иначе.
    //
    // Теперь решает один. Расходиться нечему — выключенного типа в базе нет.
    if (!(await this.isWanted(addressee, recipient, type))) {
      return null;
    }

    try {
      return await this.notifications.insert({ ...addressee, type, payload });
    } catch (error) {
      this.logger.error(
        `Не удалось создать уведомление ${type} для пользователя ${addressee.userId}`,
        error,
      );

      return null;
    }
  }

  /**
   * Хочет ли адресат такое уведомление.
   *
   * ⚠️ Настройки спрашиваются у ТОГО ЯЩИКА, которому адресована строка: у лица —
   * у лица, у человека — личные. Смешать их нельзя: у владельца трёх клубов
   * четыре ящика, и заглушённая заявка в одном клубе не имеет отношения ни к другому
   * клубу, ни к нему самому.
   *
   * ⚠️ Обязательные типы проверку минуют. Правило `canDisableNotificationType` одно
   * на оба места — запись настроек такой ключ игнорирует, — но проверка стоит и здесь:
   * запись можно обойти запросом мимо интерфейса, а подтверждение записи человек
   * обязан получить в любом случае.
   *
   * ⚠️ Сбой чтения настроек трактуется как «хочет». Потерянное уведомление
   * не восстановить, а лишнее человек просто прочтёт — ошибаться надо в эту сторону.
   */
  private async isWanted(
    addressee: { userId: EntityId },
    recipient: NotificationRecipient,
    type: NotificationType,
  ): Promise<boolean> {
    if (!canDisableNotificationType(type)) {
      return true;
    }

    // Ящик настроек: у лица — само лицо, у человека — отсутствие лица.
    const face =
      'userId' in recipient
        ? undefined
        : ({ type: recipient.addresseeType, id: recipient.addresseeId } as const);

    try {
      const preferences = await this.users.findNotificationPreferences(addressee.userId, face);

      // Отсутствие строки означает «не настраивал» — то есть согласен.
      return preferences[type] !== false;
    } catch (error) {
      this.logger.error(
        `Не удалось прочитать настройки уведомлений пользователя ${addressee.userId}`,
        error,
      );

      return true;
    }
  }
}
