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
import {
  canDisableNotificationType,
  accountCan,
  accountKindOf,
  NOTIFICATION_GROUP_KEYS,
} from '@sporthub/domain';
import type { NotificationGroupKey } from '@sporthub/domain';
import type { Notification, NotificationType } from '@sporthub/types';
import { z } from 'zod';

import { AccessService } from '../access/access.service';
import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import type {
  NotificationsAudience,
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

/**
 * Тема ленты из строки запроса.
 *
 * ⚠️ Негодное значение — это НЕ «покажи всё»: молчаливое расширение выдачи там,
 * где просили сузить, — способ не заметить опечатку в адресе. Но и падать здесь
 * нечем: параметр необязательный, и отсутствие темы — законный случай. Поэтому
 * неизвестная тема отвергается явно.
 */
function parseGroup(raw: string | undefined): NotificationGroupKey | undefined {
  if (raw === undefined || raw === '') return undefined;

  if (!(NOTIFICATION_GROUP_KEYS as readonly string[]).includes(raw)) {
    throw new ValidationError('Некорректная тема уведомлений');
  }

  return raw as NotificationGroupKey;
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
    @Query('group') rawGroup?: string,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    // ⚠️ Шаг 37.19. Режим `scope=all` — полное чтение ленты ВСЕЙ платформы в память —
    // закрыт. Он был последним таким чтением в проекте и держался на одном доводе:
    // «нужен сводкам кабинета провайдера». Довод устарел — из веба маршрут в этом
    // режиме не зовётся ни разу, — а с появлением очереди надзора он стал ещё и
    // опасен: отдал бы администратору чужие надзорные строки вперемешку с личными.
    //
    // Закрыт отказом, а не молчаливым сужением: клиент, который его всё-таки звал,
    // обязан узнать об этом, а не получить половину ленты и посчитать это нормой.
    if (scope === 'all') {
      throw new ForbiddenError('Режим scope=all закрыт: спрашивайте конкретный ящик');
    }

    const onlyUnread = unreadOnly === 'true' || unreadOnly === '1';
    const offset = optionalNumber(rawOffset) ?? 0;
    const rawLimitValue = optionalNumber(rawLimit);
    // Лимит не назван — берётся умолчание; назван больше потолка — срезается.
    const limit = rawLimitValue === undefined ? DEFAULT_LIMIT : Math.min(rawLimitValue, MAX_LIMIT);

    // ⚠️ Адресат определяется ДО всего остального: от него зависит и отбор,
    // и право на чтение.
    const audience = await this.resolveAudience(session, scope, rawClubId, rawTrainerId);
    const group = parseGroup(rawGroup);
    // ⚠️ Шаг 36.50. Отбора по настройкам здесь БОЛЬШЕ НЕТ, и это не упущение.
    // Решение принимается при отправке (36.49): выключенного типа в базе нет вовсе,
    // и прятать при чтении нечего.
    //
    // Пока фильтр стоял здесь, его повторяли трое — лента, счётчик и колокольчик, —
    // и за две фазы они разошлись трижды. Убрать его — не «упростить», а снять
    // сам повод расходиться.
    // Страница, общее число и непрочитанные — тремя запросами и параллельно.
    // Прежде это была ОДНА лента, прочитанная целиком и порезанная срезом массива,
    // плюс вторая такая же ради счётчика непрочитанных.
    //
    // ⚠️ Счётчик непрочитанных считается по ТОМУ ЖЕ ящику, что и выдача. Разойдясь,
    // они дают «в колокольчике 3, в списке 0»: цифра есть, а строк под ней нет.
    const [items, total, unreadCount] = await Promise.all([
      this.notifications.findMany({
        ...audience,
        group,
        unreadOnly: onlyUnread,
        offset,
        limit,
      }),
      this.notifications.count({ ...audience, group, unreadOnly: onlyUnread }),
      // ⚠️ Счётчик непрочитанного считается по тому же адресату и той же теме:
      // разойдясь хоть одним условием, они дадут «в значке 3, в списке 0».
      this.notifications.count({ ...audience, group, unreadOnly: true }),
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
    const audience = await this.resolveAudience(session, scope, rawClubId, rawTrainerId);

    // Счётчик и лента спрашивают базу ОДИНАКОВО — ни у той, ни у другой нет больше
    // своего отбора. Именно расхождение этих двух условий давало «в колокольчике 3,
    // в списке 0» (шаг 36.50).
    return {
      unreadCount: await this.notifications.count({ ...audience, unreadOnly: true }),
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
    //
    // ⚠️ Шаг 37.17. В общей очереди надзора это действие гасит её ВСЕМ и сразу,
    // поэтому разобравший называется подписью: «кто-то разобрал» — половина ответа.
    const audience = await this.resolveAudience(session, scope, rawClubId, rawTrainerId);
    const updatedCount = await this.notifications.markAllRead(audience, session.user.id);

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
    // ⚠️ Шаг 37.16. Доказательств права стало ДВА, и второе — не «на всякий случай».
    // У надзорной строки владельца-человека нет вовсе: проверка через `userId`
    // вернула бы ноль и отвечала бы «не найдено» КАЖДОМУ администратору — то есть
    // выглядела бы как пропавшая строка, а не как дыра в разборе.
    const visible = await this.notifications.count({
      ...this.audienceOfSession(session),
      ids: [notificationId],
    });

    if (visible === 0) {
      throw new NotFoundError('Уведомление не найдено');
    }

    return this.notifications.markRead(notificationId, session.user.id);
  }

  @Post(':id/unread')
  @HttpCode(HttpStatus.OK)
  async markUnread(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<Notification> {
    const notificationId = Number(rawId);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw new ValidationError('Некорректный id уведомления');
    }

    // ⚠️ Право доказывается тем же способом, что и при отметке (шаг 37.16):
    // у надзорной строки владельца-человека нет, и отбор по `userId` вернул бы
    // «не найдено» каждому администратору.
    const visible = await this.notifications.count({
      ...this.audienceOfSession(session),
      ids: [notificationId],
    });

    if (visible === 0) {
      throw new NotFoundError('Уведомление не найдено');
    }

    return this.notifications.markUnread(notificationId);
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
    // ⚠️ Шаг 37.16. Удаление разбирается по тем же двум путям, что и отметка:
    // у надзорных строк владельца нет, и отбор по `userId` вернул бы пустоту,
    // а ответ — 200 с `deleted: 0`. Такой отказ выглядит как отсутствие строк,
    // а не как нехватка прав, и искать его пришлось бы долго.
    const own = await this.notifications.findMany({
      ...this.audienceOfSession(session),
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
  /**
   * Чей ящик доказывает право на СТРОКУ — при отметке и при удалении.
   *
   * Здесь спрашивается не «какую ленту показать», а «кому эта строка своя».
   * Формы ровно две, и они не пересекаются: у администратора человеческого набора
   * нет вовсе (решение 13 фазы 35), у человека нет полномочий надзора. Поэтому
   * читать саму строку, чтобы выбрать путь, не требуется — достаточно того,
   * кто спрашивает.
   */
  private audienceOfSession(session: SessionContext): NotificationsAudience {
    return accountCan(accountKindOf(session.user), 'moderate_publications')
      ? { supervision: true }
      : { userId: session.user.id };
  }

  private async resolveAudience(
    session: SessionContext,
    scope: string | undefined,
    rawClubId: string | undefined,
    rawTrainerId: string | undefined,
  ): Promise<NotificationsAudience> {
    // ⚠️ Шаг 37.15. Очередь надзора — четвёртая форма, и право на неё спрашивается
    // не у ВЛАДЕНИЯ, а у полномочий: у общей очереди владельца нет вовсе.
    // Отказ, а не пустая лента: пустая читается как «событий пока нет» и прячет
    // то, что спрашивать было нечего.
    if (scope === 'supervision') {
      if (!accountCan(accountKindOf(session.user), 'moderate_publications')) {
        throw new ForbiddenError('Недостаточно прав');
      }

      return { supervision: true };
    }

    const clubId = optionalNumber(rawClubId);
    const trainerId = optionalNumber(rawTrainerId);

    // Два лица разом — это два ящика, и какой из них имелся в виду, неизвестно.
    if (clubId !== undefined && trainerId !== undefined) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const userId = session.user.id;

    if (clubId !== undefined) {
      if (!(await this.access.isManagerOfClub(clubId, userId))) {
        throw new ForbiddenError('Недостаточно прав');
      }

      return { userId, mailbox: { kind: 'club', id: clubId } };
    }

    if (trainerId !== undefined) {
      if (!(await this.access.isManagerOfTrainer(trainerId, userId))) {
        throw new ForbiddenError('Недостаточно прав');
      }

      return { userId, mailbox: { kind: 'trainer', id: trainerId } };
    }

    return scope === 'personal' ? { userId, mailbox: { kind: 'personal' } } : { userId };
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
