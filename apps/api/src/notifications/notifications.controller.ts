// Контроллеры уведомлений.
//
// ⚠️ Счётчики здесь лежат ВНУТРИ `data` — `{ items, total, unreadCount }`, тогда
// как журнал и публикации кладут `total` рядом с `data`. Две разные формы ответа
// на соседних маршрутах, обе закреплены фронтом.
//
// ⚠️ Фаза 35, шаг 35.28. У ленты появился АДРЕСАТ-ЛИЦО, а значит и ящики:
// `?club=<id>` — ящик клуба, `?trainer=<id>` — ящик карточки, `?scope=personal` —
// только личные уведомления человека, без параметров — объединённый срез «всё моё».
// Чужое лицо назвать нечем: владение спрашивается у `AccessService`, и на чужой
// номер приходит отказ, а не пустая лента (пустая читалась бы как «уведомлений нет»).
//
// Настройки пользователя применяются при чтении, а не при создании: выключенный
// тип продолжает писаться в хранилище, но не показывается и не считается.
//
// Раньше эти настройки и мешали переносу: отбор по ним стоял ПОСЛЕ чтения ленты,
// а значит ни постраничность, ни счётчик непрочитанных не могли уехать в запрос —
// срез по набору, отфильтрованному в памяти, `LIMIT`ом не выражается. Теперь правило
// домена сначала превращается в СПИСОК отключённых типов (для этого достаточно
// одного чтения пользователя), а список — в обычное условие запроса. Репозиторий
// при этом по-прежнему не знает ни про настройки, ни про обязательные типы.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { canDisableNotificationType, accountCan, accountKindOf } from '@sporthub/domain';
import type { Notification, NotificationType } from '@sporthub/types';
import { z } from 'zod';

import { AccessService } from '../access/access.service';
import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import type {
  NotificationMailbox,
  NotificationsRepository,
} from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

/** Верхняя граница страницы. Больше сотни маршрут не отдаёт никогда. */
const MAX_LIMIT = 100;

/**
 * Страница по умолчанию — когда клиент лимит не назвал.
 *
 * ⚠️ Найдено нагрузкой шага 35.45. Потолок был, но применялся только к ЗАДАННОМУ
 * лимиту: клиент, не назвавший его, получал ленту ЦЕЛИКОМ. Постраничность при этом
 * существовала и работала — просто по умолчанию была выключена, и цена запроса
 * росла вместе с историей человека. У испытуемого 66 уведомлений давали 12 КБ;
 * за год активной жизни это мегабайты на каждое открытие кабинета.
 *
 * Умолчание равно потолку намеренно: клиенту, который лимит не называл, отдаётся
 * ровно столько, сколько маршрут в принципе готов отдать за раз. Общее число едет
 * рядом (`total`) — дочитать остальное есть чем.
 */
const DEFAULT_LIMIT = MAX_LIMIT;

const deleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

function optionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;

  if (!/^\d+$/.test(raw)) {
    throw new ValidationError('Некорректные параметры запроса');
  }

  return Number(raw);
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notifications: NotificationsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly access: AccessService,
  ) {}

  @Get()
  async findMany(
    @CurrentUser() session: SessionContext,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('offset') rawOffset?: string,
    @Query('limit') rawLimit?: string,
    @Query('scope') scope?: string,
    @Query('clubId') rawClubId?: string,
    @Query('trainerId') rawTrainerId?: string,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    // Полный срез без разбора адресата: нужен сводкам личного кабинета
    // провайдера. Настройки пользователя к нему не применяются — они
    // персональные, а здесь смешаны уведомления разных людей.
    //
    // ⚠️ Единственное место в этом файле, где чтение осталось полным, и убрать его
    // правкой контроллера нельзя: маршрут по контракту отдаёт всю ленту целиком,
    // а считать длину уже прочитанного массива дешевле, чем спрашивать базу второй
    // раз. Закрывается только вместе с потребителем — сводками кабинета провайдера.
    if (scope === 'all') {
      // ⚠️ Полный срез ленты платформы — служебное чтение, а не пользовательское.
      // До фазы 34 он открывался ЛЮБОМУ по одному параметру в строке запроса
      // и отдавал уведомления всех людей разом.
      if (!accountCan(accountKindOf(session.user), 'use_admin_tools')) {
        throw new ForbiddenError('Недостаточно прав');
      }

      const all = await this.notifications.findMany({});

      return {
        items: all,
        total: all.length,
        unreadCount: all.filter((item) => item.readAt === undefined).length,
      };
    }

    const userId = session.user.id;
    const onlyUnread = unreadOnly === 'true' || unreadOnly === '1';
    const offset = optionalNumber(rawOffset) ?? 0;
    const rawLimitValue = optionalNumber(rawLimit);
    // Лимит не назван — берётся умолчание; назван больше потолка — срезается.
    const limit = rawLimitValue === undefined ? DEFAULT_LIMIT : Math.min(rawLimitValue, MAX_LIMIT);

    // ⚠️ Ящик определяется ДО настроек: настройки берутся того ящика, чью ленту
    // показываем. Обратный порядок давал бы личные настройки на ленту лица.
    const mailbox = await this.resolveMailbox(session, scope, rawClubId, rawTrainerId);
    // ⚠️ Шаг 36.50. Отбора по настройкам здесь БОЛЬШЕ НЕТ, и это не упущение.
    // Решение принимается при отправке (36.49): выключенного типа в базе нет вовсе,
    // и прятать при чтении нечего.
    //
    // Пока фильтр стоял здесь, его повторяли трое — лента, счётчик и колокольчик, —
    // и за две фазы они разошлись трижды. Убрать его — не «упростить», а снять
    // сам повод расходиться.
    const inMailbox = mailbox === undefined ? {} : { mailbox };

    // Страница, общее число и непрочитанные — тремя запросами и параллельно.
    // Прежде это была ОДНА лента, прочитанная целиком и порезанная срезом массива,
    // плюс вторая такая же ради счётчика непрочитанных.
    //
    // ⚠️ Счётчик непрочитанных считается по ТОМУ ЖЕ ящику, что и выдача. Разойдясь,
    // они дают «в колокольчике 3, в списке 0»: цифра есть, а строк под ней нет.
    const [items, total, unreadCount] = await Promise.all([
      this.notifications.findMany({
        userId,
        ...inMailbox,
        unreadOnly: onlyUnread,
        offset,
        limit,
      }),
      this.notifications.count({ userId, ...inMailbox, unreadOnly: onlyUnread }),
      this.notifications.count({ userId, ...inMailbox, unreadOnly: true }),
    ]);

    return { items, total, unreadCount };
  }

  @Get('unread-count')
  async unreadCount(
    @CurrentUser() session: SessionContext,
    @Query('scope') scope?: string,
    @Query('clubId') rawClubId?: string,
    @Query('trainerId') rawTrainerId?: string,
  ): Promise<{ unreadCount: number }> {
    const userId = session.user.id;
    const mailbox = await this.resolveMailbox(session, scope, rawClubId, rawTrainerId);

    // Счётчик и лента спрашивают базу ОДИНАКОВО — ни у той, ни у другой нет больше
    // своего отбора. Именно расхождение этих двух условий давало «в колокольчике 3,
    // в списке 0» (шаг 36.50).
    return {
      unreadCount: await this.notifications.count({
        userId,
        ...(mailbox === undefined ? {} : { mailbox }),
        unreadOnly: true,
      }),
    };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(
    @CurrentUser() session: SessionContext,
    @Query('scope') scope?: string,
    @Query('clubId') rawClubId?: string,
    @Query('trainerId') rawTrainerId?: string,
  ): Promise<{ updatedCount: number }> {
    // До фазы 34 маршрут не проверял вообще ничего: прислал чужой номер — пометил
    // прочитанными чужие уведомления.
    //
    // ⚠️ Шаг 35.28, ловушка 7.7. Кнопка «прочитать всё» стоит В ЯЩИКЕ, и гасить
    // она обязана ровно этот ящик. Без области действия один клик в ящике одного
    // клуба гасил бы ящики всех остальных лиц человека — массово и необратимо.
    const mailbox = await this.resolveMailbox(session, scope, rawClubId, rawTrainerId);
    const updatedCount = await this.notifications.markAllRead({
      userId: session.user.id,
      ...(mailbox === undefined ? {} : { mailbox }),
    });

    return { updatedCount };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<Notification> {
    const notificationId = Number(rawId);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw new ValidationError('Некорректный id уведомления');
    }

    // Чужое уведомление отвечает тем же «не найдено», что и несуществующее:
    // иначе по коду ответа можно было бы перебирать чужие идентификаторы.
    // Настройки здесь НЕ применяются: пометить прочитанным можно и скрытое.
    //
    // Принадлежность проверяет запрос по одному номеру, а не чтение всей ленты
    // пользователя ради поиска в ней одной строки.
    //
    // ⚠️ Шаг 35.28. Спрашивается ОБЪЕДИНЁННЫЙ ящик — без сужения до личного.
    // Уведомление клубу несёт и лицо, и его владельца-человека, поэтому владелец
    // находит его здесь. Сузь проверку до личного ящика — и владелец клуба начнёт
    // получать «не найдено» на собственное уведомление, а причина будет выглядеть
    // как пропавшая строка.
    const owned = await this.notifications.count({
      userId: session.user.id,
      ids: [notificationId],
    });

    if (owned === 0) {
      throw new NotFoundError('Уведомление не найдено');
    }

    return this.notifications.markRead(notificationId);
  }

  @Delete()
  async remove(
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<{ deleted: number }> {
    const parsed = deleteSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректное тело запроса');
    }

    // Спрашивается только про названные номера, а не про всю ленту пользователя:
    // чужие среди них просто не вернутся. Ящик не сужается по той же причине,
    // что и в пометке прочитанным: уведомления своих лиц — тоже свои.
    const own = await this.notifications.findMany({
      userId: session.user.id,
      ids: parsed.data.ids,
    });
    // Чужие идентификаторы отбрасываются молча — в ответе видно только
    // фактическое число удалённого.
    const deleted = await this.notifications.removeMany(own.map((item) => item.id));

    return { deleted };
  }

  /**
   * Какой ящик спрашивают — и вправе ли.
   *
   * Три формы: `?clubId=` / `?trainerId=` — ящик лица, `?scope=personal` — только
   * личные уведомления человека, ничего — объединённый срез «всё моё». Последняя
   * остаётся умолчанием, поэтому старый клиент, ничего про ящики не знающий,
   * переживает выкатку без правок.
   *
   * ⚠️ Владение спрашивается у `AccessService` — единственного места, где оно живёт.
   * На чужое лицо приходит ОТКАЗ, а не пустая лента: пустая читается как
   * «уведомлений пока нет» и прячет то, что спрашивать было нечего.
   */
  private async resolveMailbox(
    session: SessionContext,
    scope: string | undefined,
    rawClubId: string | undefined,
    rawTrainerId: string | undefined,
  ): Promise<NotificationMailbox | undefined> {
    const clubId = optionalNumber(rawClubId);
    const trainerId = optionalNumber(rawTrainerId);

    // Два лица разом — это два ящика, и какой из них имелся в виду, неизвестно.
    if (clubId !== undefined && trainerId !== undefined) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    if (clubId !== undefined) {
      if (!(await this.access.isManagerOfClub(clubId, session.user.id))) {
        throw new ForbiddenError('Недостаточно прав');
      }

      return { kind: 'club', id: clubId };
    }

    if (trainerId !== undefined) {
      if (!(await this.access.isManagerOfTrainer(trainerId, session.user.id))) {
        throw new ForbiddenError('Недостаточно прав');
      }

      return { kind: 'trainer', id: trainerId };
    }

    return scope === 'personal' ? { kind: 'personal' } : undefined;
  }

  /**
   * Типы, которые пользователь у себя выключил.
   *
   * Правило «включён ли тип» живёт в домене и знает про обязательные типы, которые
   * отключить нельзя. Здесь оно применяется к тем типам, про которые у пользователя
   * вообще есть решение, и превращается в список для условия запроса. Пользователя
   * нет — списка нет: лента показывается целиком, как и раньше.
   */
  /**
   * Типы, выключенные для ОТКРЫТОГО ящика.
   *
   * ⚠️ Найдено браузерным прогоном 10.09.2026, и это была дыра в готовой на вид
   * работе. Настройки на лицо появились шагом 35.29: маршрут их принимал, база
   * хранила, чтение отдавало обратно. А применения не было — здесь читались только
   * ЛИЧНЫЕ строки. Владелец глушил уведомления клуба, настройка сохранялась,
   * возвращалась при следующем открытии — и ничего не меняла ни в ленте,
   * ни в счётчике, ни в колокольчике.
   *
   * Ящик у настроек был, применения у ящика — нет.
   *
   * Теперь спрашивается ящик, чью ленту показывают: настройки лица действуют
   * на ленту лица, личные — на личную. Ящик не назван (общая лента человека) —
   * действуют личные: другого разумного умолчания нет, а показать всё подряд,
   * игнорируя настройки вовсе, значило бы вернуть ту же дыру с другой стороны.
   */
}

export const NOTIFICATION_CONTROLLERS = [NotificationsController];
