// Глобальный guard: закрыто по умолчанию.
//
// Главный смысл фазы 34 не в том, чтобы заткнуть 28 открытых маршрутов — их можно
// закрыть и руками. Смысл в том, что маршрут, который напишут через год, будет
// закрыт САМ, а открыть его придётся сознательно, пометкой `@Public`.
//
// Guard бросает ДОМЕННЫЕ ошибки, а не исключения Nest.
//
// ⚠️ Уточнение по итогам прогона диверсий (34.57): форма ответа при этом НЕ меняется —
// `DomainErrorFilter` объявлен `@Catch()` и приводит `HttpException` к той же форме
// `{ success: false, error }`. Прежний комментарий здесь утверждал обратное и был неверен.
// Причина использовать доменные ошибки другая и остаётся в силе: текст ответа. Исключение
// Nest без явного сообщения отдаёт английское `Unauthorized`, и это видно снаружи —
// проверено встречной диверсией.

import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { accountCan, accountKindOf, type Capability } from '@sporthub/domain';
import type { Request } from 'express';

import { AccessService } from '../access/access.service';
import { ForbiddenError, UnauthorizedError } from '../common/domain-error';
import {
  IS_PUBLIC,
  OWNED_PUBLICATION,
  REQUIRED_CAPABILITY,
  type OwnedPublicationKind,
} from './access.decorators';
import { readSessionCookie } from './session-cookie';
import { SessionService, type SessionContext } from './session.service';

/** Запрос с разобранной личностью: контроллеры читают её через `@CurrentUser`. */
export type RequestWithSession = Request & { sessionContext?: SessionContext };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Пометки читаются и с метода, и с класса: `@Public` на контроллере открывает
    // все его маршруты — так помечены справочники, где открыт каждый.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const token = readSessionCookie(request);

    // Публичный маршрут личность НЕ требует, но если сессия есть — разбирает её.
    // Это не любезность: публичная выдача каталога скрывает чужие черновики, а для
    // этого нужно знать, кто спрашивает. Негодная сессия на публичном маршруте
    // не мешает: гость и есть гость.
    if (isPublic) {
      if (token !== null) {
        request.sessionContext = (await this.sessions.resolve(token, new Date())) ?? undefined;
      }

      return true;
    }

    if (token === null) {
      throw new UnauthorizedError('Требуется вход');
    }

    const sessionContext = await this.sessions.resolve(token, new Date());

    // Причина негодности наружу не различается: истёкшая, отозванная и поддельная
    // сессии отвечают одинаково. Разные ответы рассказывали бы о чужих сессиях.
    if (sessionContext === null) {
      throw new UnauthorizedError('Требуется вход');
    }

    request.sessionContext = sessionContext;

    const capabilities = this.reflector.getAllAndOverride<Capability[]>(REQUIRED_CAPABILITY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (capabilities === undefined) return true;

    // Право проверяется по роли ТОГО, ОТ ЧЬЕГО ЛИЦА действуют. Под имперсонизацией
    // это цель, а не администратор: смысл имперсонизации в том, чтобы увидеть
    // площадку глазами пользователя, а не пройти его маршрутами с админскими правами.
    //
    // Перечисленных прав хватает ЛЮБОГО: маршрут, к которому ведут две разные
    // причины (своё владение или модерация), иначе пришлось бы либо открывать
    // без права вовсе, либо заводить третье право-синоним.
    if (
      capabilities.some((capability) => accountCan(accountKindOf(sessionContext.user), capability))
    ) {
      return true;
    }

    // Роль не подошла — но вещь может быть его собственной, и тогда решает владение
    // (шаг 35.17). Порядок именно такой: право проверяется по словарю и не стоит
    // ни одного запроса, владение — стоит одного чтения публикации, и платить за
    // него имеет смысл только там, где роль уже отказала.
    if (await this.ownsRouteTarget(context, request, sessionContext.user.id)) {
      return true;
    }

    throw new ForbiddenError('Недостаточно прав');
  }

  /**
   * Принадлежит ли вызывающему та вещь, чей номер стоит в пути маршрута.
   *
   * Отвечает `false` всюду, где вопрос не задан: маршрут без пометки `@OrOwnerOf`,
   * нечисловой номер, чужая или несуществующая публикация. Разбор номера здесь
   * НЕ бросает ошибку разбора — иначе guard отвечал бы «неверный идентификатор»
   * вместо отказа по правам, и по одному коду ответа стало бы видно, где маршрут
   * останавливается раньше проверки.
   *
   * ⚠️ Владение спрашивается у `AccessService` — того же, что отвечает на этот
   * вопрос сервисам публикаций и записей. Своего чтения `managedByUserId` здесь
   * нет намеренно: две правды о владении разъезжаются на первой же правке.
   */
  private async ownsRouteTarget(
    context: ExecutionContext,
    request: RequestWithSession,
    userId: number,
  ): Promise<boolean> {
    const kind = this.reflector.getAllAndOverride<OwnedPublicationKind | undefined>(
      OWNED_PUBLICATION,
      [context.getHandler(), context.getClass()],
    );

    if (kind === undefined) return false;

    const publicationId = Number(request.params?.id);

    if (!Number.isInteger(publicationId) || publicationId <= 0) return false;

    return kind === 'club'
      ? this.access.isManagerOfClub(publicationId, userId)
      : this.access.isManagerOfTrainer(publicationId, userId);
  }
}
